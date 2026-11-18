use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OptionalExtension, params};
use std::{
    io::Write,
    mem::MaybeUninit,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use wasmtime::{
    Engine, Store,
    component::{Component, Linker, ResourceTable},
};
use wasmtime_wasi::{WasiCtx, WasiCtxView, WasiView, p2::bindings::sync::Command};

wasmtime::component::bindgen!({ path: "wit", world: "host" });
use exotui::host::terminal::{Dimensions, Host as TerminalHost};

struct State {
    wasi: WasiCtx,
    table: ResourceTable,
    stop: Arc<AtomicBool>,
    db: Connection,
    limits: wasmtime::StoreLimits,
}

impl WasiView for State {
    fn ctx(&mut self) -> WasiCtxView<'_> {
        WasiCtxView {
            ctx: &mut self.wasi,
            table: &mut self.table,
        }
    }
}

const INPUT: libc::c_int = libc::STDIN_FILENO;
const LEAVE: &[u8] = b"\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[0m\x1b[?25h\x1b[?1049l";
const MAX_VALUE: usize = 1024 * 1024;
const SCHEMA: &str = include_str!("store.sql");

struct Terminal(libc::termios);
impl Terminal {
    fn enter() -> Result<Self> {
        let mut saved = MaybeUninit::uninit();
        // SAFETY: tcgetattr initializes the termios on success; the PTY is owned by the caller.
        if unsafe { libc::tcgetattr(INPUT, saved.as_mut_ptr()) } != 0 {
            return Err(std::io::Error::last_os_error()).context("terminal input required");
        }
        let saved = unsafe { saved.assume_init() };
        let mut raw = saved;
        // SAFETY: both calls borrow a valid termios; no file descriptor ownership is transferred.
        unsafe { libc::cfmakeraw(&mut raw) };
        if unsafe { libc::tcsetattr(INPUT, libc::TCSANOW, &raw) } != 0 {
            return Err(std::io::Error::last_os_error()).context("entering raw terminal mode");
        }
        Ok(Self(saved))
    }
}
impl Drop for Terminal {
    fn drop(&mut self) {
        // The guest may trap before it sends the normal screen reset.
        let _ = terminal_write(LEAVE);
        // SAFETY: self.0 is the saved valid termios for INPUT.
        unsafe { libc::tcsetattr(INPUT, libc::TCSANOW, &self.0) };
    }
}

fn terminal_write(data: &[u8]) -> std::io::Result<()> {
    let mut out = std::io::stdout().lock();
    out.write_all(data)?;
    out.flush()
}

fn check_key(namespace: &str, key: &str) -> Result<(), String> {
    if namespace != "desktop" || key.len() > 256 || key.contains('\0') {
        return Err("store namespace or key is not allowed".into());
    }
    Ok(())
}

impl TerminalHost for State {
    fn size(&mut self) -> Dimensions {
        let mut size = libc::winsize {
            ws_row: 0,
            ws_col: 0,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        // SAFETY: ioctl receives a valid writable winsize struct.
        if unsafe { libc::ioctl(INPUT, libc::TIOCGWINSZ, &mut size) } == 0
            && size.ws_row > 0
            && size.ws_col > 0
        {
            Dimensions {
                columns: size.ws_col.min(500),
                rows: size.ws_row.min(200),
            }
        } else {
            Dimensions {
                columns: 80,
                rows: 24,
            }
        }
    }

    fn read(&mut self) -> Result<Vec<u8>, String> {
        let mut fd = libc::pollfd {
            fd: INPUT,
            events: libc::POLLIN,
            revents: 0,
        };
        // SAFETY: fd is one initialized pollfd; a timeout of zero makes this nonblocking.
        if unsafe { libc::poll(&mut fd, 1, 0) } <= 0 {
            return Ok(vec![]);
        }
        if fd.revents & libc::POLLIN == 0 {
            self.stop.store(true, Ordering::Relaxed);
            return Ok(vec![]);
        }
        let mut bytes = vec![0u8; 1024];
        // SAFETY: bytes is writable for bytes.len() bytes. The launcher is the sole reader.
        let count = unsafe { libc::read(INPUT, bytes.as_mut_ptr().cast(), bytes.len()) };
        if count < 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        if count == 0 {
            self.stop.store(true, Ordering::Relaxed);
        }
        bytes.truncate(count as usize);
        Ok(bytes)
    }

    fn write(&mut self, bytes: Vec<u8>) -> Result<(), String> {
        if bytes.len() > MAX_VALUE {
            return Err("terminal write too large".into());
        }
        terminal_write(&bytes).map_err(|e| e.to_string())
    }
    fn stopped(&mut self) -> bool {
        self.stop.load(Ordering::Relaxed)
    }

    fn get(&mut self, namespace: String, key: String) -> Result<Option<Vec<u8>>, String> {
        check_key(&namespace, &key)?;
        self.db
            .query_row(
                "SELECT value FROM exotui_kv WHERE namespace=?1 AND key=?2",
                params![namespace, key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())
    }
    fn set(&mut self, namespace: String, key: String, bytes: Vec<u8>) -> Result<(), String> {
        check_key(&namespace, &key)?;
        if bytes.len() > MAX_VALUE {
            return Err("store value too large".into());
        }
        self.db.execute("INSERT INTO exotui_kv VALUES (?1,?2,?3) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value", params![namespace,key,bytes])
            .map(|_| ()).map_err(|e| e.to_string())
    }
    fn delete(&mut self, namespace: String, key: String) -> Result<(), String> {
        check_key(&namespace, &key)?;
        self.db
            .execute(
                "DELETE FROM exotui_kv WHERE namespace=?1 AND key=?2",
                params![namespace, key],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn main() -> Result<()> {
    let mut args = std::env::args_os().skip(1);
    let (Some(component_path), Some(database_path), None) = (args.next(), args.next(), args.next())
    else {
        bail!(
            "usage: exotui-wasi COMPONENT.wasm STATE.sqlite (use :memory: for an ephemeral session)"
        );
    };
    if unsafe { libc::isatty(libc::STDOUT_FILENO) } != 1 {
        bail!("terminal output required");
    }
    let stop = Arc::new(AtomicBool::new(false));
    for signal in [libc::SIGINT, libc::SIGTERM, libc::SIGHUP] {
        signal_hook::flag::register(signal, Arc::clone(&stop))?;
    }
    let db = Connection::open(database_path).context("opening desktop state")?;
    db.busy_timeout(Duration::from_millis(250))?;
    db.execute_batch(SCHEMA)?;
    let mut config = wasmtime::Config::new();
    config.cranelift_opt_level(wasmtime::OptLevel::None);
    let engine = Engine::new(&config)?;
    let component = Component::from_file(&engine, component_path)?;
    let mut linker = Linker::new(&engine);
    wasmtime_wasi::p2::add_to_linker_sync(&mut linker)?;
    exotui::host::terminal::add_to_linker::<_, wasmtime::component::HasSelf<_>>(
        &mut linker,
        |s| s,
    )?;
    let mut store = Store::new(
        &engine,
        State {
            wasi: WasiCtx::builder().inherit_stderr().build(),
            table: ResourceTable::new(),
            stop,
            db,
            limits: wasmtime::StoreLimitsBuilder::new()
                .memory_size(256 * 1024 * 1024)
                .table_elements(100_000)
                .build(),
        },
    );
    store.limiter(|state| &mut state.limits);
    let command = Command::instantiate(&mut store, &component, &linker)?;
    let terminal = Terminal::enter()?;
    let result = command.wasi_cli_run().call_run(&mut store);
    drop(terminal);
    result?.map_err(|()| anyhow::anyhow!("desktop guest exited with an error"))
}
