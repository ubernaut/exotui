import {
  type Camera,
  Color,
  HalfFloatType,
  LinearFilter,
  type Node,
  type NodeFrame,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  type Renderer,
  RendererUtils,
  RenderTarget,
  TempNode,
  type Texture,
  type TextureNode,
  type UniformNode,
  Vector2,
} from "three/webgpu";
import {
  abs,
  clamp,
  convertToTexture,
  cross,
  exp,
  exp2,
  float,
  floor,
  Fn,
  If,
  luminance,
  max,
  min,
  mix,
  mod,
  mx_atan2,
  normalize,
  passTexture,
  perspectiveDepthToViewZ,
  PI,
  pow,
  saturate,
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewZToOrthographicDepth,
} from "three/tsl";

import { colorValue } from "./colors.ts";

const _quadMesh = /* @__PURE__ */ new QuadMesh();
const _renderSize = /* @__PURE__ */ new Vector2();

let _rendererState: ReturnType<typeof RendererUtils.saveRendererState> | undefined;

type TslFragmentFactory = () => Node<"vec4">;

// Color uniforms compile as vec3 in Three, but vec3's overloads omit "color".
const colorVec3 = vec3 as unknown as (color: Node<"color">) => ReturnType<typeof vec3>;

// PassTextureNode only registers its owning node as a graph dependency. Three's
// declaration restricts that dependency to PassNode despite supporting custom
// multi-pass nodes such as this one at runtime.
const customPassTexture = passTexture as unknown as (
  pass: Node,
  output: Texture,
) => ReturnType<typeof passTexture>;

// The implementation initializes missing state; the declaration requires it.
const resetRendererState = RendererUtils.resetRendererState as (
  renderer: Renderer,
  state?: ReturnType<typeof RendererUtils.saveRendererState>,
) => ReturnType<typeof RendererUtils.saveRendererState>;

/** Options for configuring acerola Ascii Node. */
export interface AcerolaAsciiNodeOptions {
  resolutionScale?: number;
  zoom?: number;
  offset?: Vector2 | { x: number; y: number };
  kernelSize?: number;
  sigma?: number;
  sigmaScale?: number;
  tau?: number;
  threshold?: number;
  useDepth?: boolean;
  depthThreshold?: number;
  useNormals?: boolean;
  normalThreshold?: number;
  depthCutoff?: number;
  edgeThreshold?: number;
  edges?: boolean;
  fill?: boolean;
  exposure?: number;
  attenuation?: number;
  invertLuminance?: boolean;
  asciiColor?: Color | string | number;
  backgroundColor?: Color | string | number;
  blendWithBase?: number;
  depthFalloff?: number;
  depthOffset?: number;
  viewDog?: boolean;
  viewUncompressed?: boolean;
  viewEdges?: boolean;
}

/** Render-output feature profile used to prune unused Acerola ASCII passes. */
export interface AcerolaAsciiRenderProfile {
  image: boolean;
  terminalEdges: boolean;
  terminalDepthColor: boolean;
}

/** Returns whether the full-resolution composite target is needed for the current render profile. */
function shouldRenderAcerolaAsciiComposite(profile: Pick<AcerolaAsciiRenderProfile, "image">): boolean {
  return profile.image;
}

function configureMaskRenderTarget(renderTarget: RenderTarget, name: string): void {
  renderTarget.texture.name = name;
  renderTarget.texture.type = HalfFloatType;
  renderTarget.texture.generateMipmaps = false;
  renderTarget.texture.minFilter = LinearFilter;
  renderTarget.texture.magFilter = LinearFilter;
  renderTarget.depthBuffer = false;
}

function copyOffsetValue(target: Vector2, input: Vector2 | { x: number; y: number } | undefined): void {
  if (!input) {
    return;
  }

  if (input instanceof Vector2) {
    target.copy(input);
    return;
  }

  target.set(input.x, input.y);
}

/** Public class implementing an acerola Ascii Node. */
export class AcerolaAsciiNode extends TempNode<"vec4"> {
  readonly colorNode: ReturnType<typeof convertToTexture>;
  readonly depthNode: TextureNode;
  readonly camera: Camera;
  readonly edgesTexture: Texture;
  readonly fillTexture: Texture;

  readonly resolutionScale: number;

  readonly zoom: UniformNode<"float", number> = uniform(1);
  readonly offset: UniformNode<"vec2", Vector2> = uniform(new Vector2());
  readonly kernelSize: UniformNode<"float", number> = uniform(2);
  readonly sigma: UniformNode<"float", number> = uniform(2);
  readonly sigmaScale: UniformNode<"float", number> = uniform(1.6);
  readonly tau: UniformNode<"float", number> = uniform(1);
  readonly threshold: UniformNode<"float", number> = uniform(0.005);
  readonly useDepth: UniformNode<"bool", boolean> = uniform(true);
  readonly depthThreshold: UniformNode<"float", number> = uniform(0.1);
  readonly useNormals: UniformNode<"bool", boolean> = uniform(true);
  readonly normalThreshold: UniformNode<"float", number> = uniform(0.1);
  readonly depthCutoff: UniformNode<"float", number> = uniform(0);
  readonly edgeThreshold: UniformNode<"float", number> = uniform(8);
  readonly edges: UniformNode<"bool", boolean> = uniform(true);
  readonly fill: UniformNode<"bool", boolean> = uniform(true);
  readonly exposure: UniformNode<"float", number> = uniform(1);
  readonly attenuation: UniformNode<"float", number> = uniform(1);
  readonly invertLuminance: UniformNode<"bool", boolean> = uniform(false);
  readonly asciiColor: UniformNode<"color", Color> = uniform(new Color(0xffffff));
  readonly backgroundColor: UniformNode<"color", Color> = uniform(new Color(0x000000));
  readonly blendWithBase: UniformNode<"float", number> = uniform(0);
  readonly depthFalloff: UniformNode<"float", number> = uniform(0);
  readonly depthOffset: UniformNode<"float", number> = uniform(0);
  readonly viewDog: UniformNode<"bool", boolean> = uniform(false);
  readonly viewUncompressed: UniformNode<"bool", boolean> = uniform(false);
  readonly viewEdges: UniformNode<"bool", boolean> = uniform(false);
  readonly cameraNear: UniformNode<"float", number> = uniform(0.1);
  readonly cameraFar: UniformNode<"float", number> = uniform(1000);
  readonly renderSize: UniformNode<"vec2", Vector2> = uniform(new Vector2(1, 1));
  readonly inverseRenderSize: UniformNode<"vec2", Vector2> = uniform(new Vector2(1, 1));
  readonly downscaleSize: UniformNode<"vec2", Vector2> = uniform(new Vector2(1, 1));

  readonly luminanceTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly downscaleTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly blurTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly dogTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly normalsTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly edgesTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly sobelXTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly sobelTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  readonly asciiTarget: RenderTarget = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });

  private readonly luminanceTextureNode = texture(this.luminanceTarget.texture);
  private readonly downscaleTextureNode = texture(this.downscaleTarget.texture);
  private readonly blurTextureNode = texture(this.blurTarget.texture);
  private readonly dogTextureNode = texture(this.dogTarget.texture);
  private readonly normalsTextureNode = texture(this.normalsTarget.texture);
  private readonly edgesTextureNode = texture(this.edgesTarget.texture);
  private readonly sobelXTextureNode = texture(this.sobelXTarget.texture);
  private readonly sobelTextureNode = texture(this.sobelTarget.texture);
  private readonly edgesLutNode: TextureNode;
  private readonly fillLutNode: TextureNode;
  private readonly outputTextureNode: ReturnType<typeof passTexture>;

  private luminanceMaterial?: NodeMaterial;
  private downscaleMaterial?: NodeMaterial;
  private blurMaterial?: NodeMaterial;
  private dogMaterial?: NodeMaterial;
  private normalsMaterial?: NodeMaterial;
  private edgesMaterial?: NodeMaterial;
  private sobelXMaterial?: NodeMaterial;
  private sobelMaterial?: NodeMaterial;
  private asciiMaterial?: NodeMaterial;
  private targetScaledWidth = 1;
  private targetScaledHeight = 1;
  private targetDownscaleWidth = 1;
  private targetDownscaleHeight = 1;
  private renderProfile: AcerolaAsciiRenderProfile = {
    image: true,
    terminalEdges: true,
    terminalDepthColor: true,
  };

  constructor(
    colorNode: Node<"vec4">,
    depthNode: TextureNode,
    camera: Camera,
    luts: { edgesTexture: Texture; fillTexture: Texture },
    options: AcerolaAsciiNodeOptions = {},
  ) {
    super("vec4");

    this.colorNode = convertToTexture(colorNode);
    this.depthNode = depthNode;
    this.camera = camera;
    this.edgesTexture = luts.edgesTexture;
    this.fillTexture = luts.fillTexture;
    this.edgesLutNode = texture(this.edgesTexture);
    this.fillLutNode = texture(this.fillTexture);
    this.outputTextureNode = customPassTexture(this, this.asciiTarget.texture);
    this.outputTextureNode.uvNode = this.colorNode.uvNode;

    this.resolutionScale = options.resolutionScale ?? 1;

    this.applyOptions(options);

    configureMaskRenderTarget(this.luminanceTarget, "AcerolaAscii.luminance");
    configureMaskRenderTarget(this.downscaleTarget, "AcerolaAscii.downscale");
    configureMaskRenderTarget(this.blurTarget, "AcerolaAscii.blur");
    configureMaskRenderTarget(this.dogTarget, "AcerolaAscii.dog");
    configureMaskRenderTarget(this.normalsTarget, "AcerolaAscii.normals");
    configureMaskRenderTarget(this.edgesTarget, "AcerolaAscii.edges");
    configureMaskRenderTarget(this.sobelXTarget, "AcerolaAscii.sobelX");
    configureMaskRenderTarget(this.sobelTarget, "AcerolaAscii.sobel");
    configureMaskRenderTarget(this.asciiTarget, "AcerolaAscii.output");

    (this as unknown as AcerolaAsciiNode & { updateBeforeType: NodeUpdateType }).updateBeforeType =
      NodeUpdateType.FRAME;
  }

  applyOptions(options: Partial<AcerolaAsciiNodeOptions>): void {
    if (options.zoom !== undefined) {
      this.zoom.value = options.zoom;
    }

    if (options.offset !== undefined) {
      copyOffsetValue(this.offset.value, options.offset);
    }

    if (options.kernelSize !== undefined) {
      this.kernelSize.value = options.kernelSize;
    }

    if (options.sigma !== undefined) {
      this.sigma.value = options.sigma;
    }

    if (options.sigmaScale !== undefined) {
      this.sigmaScale.value = options.sigmaScale;
    }

    if (options.tau !== undefined) {
      this.tau.value = options.tau;
    }

    if (options.threshold !== undefined) {
      this.threshold.value = options.threshold;
    }

    if (options.useDepth !== undefined) {
      this.useDepth.value = options.useDepth;
    }

    if (options.depthThreshold !== undefined) {
      this.depthThreshold.value = options.depthThreshold;
    }

    if (options.useNormals !== undefined) {
      this.useNormals.value = options.useNormals;
    }

    if (options.normalThreshold !== undefined) {
      this.normalThreshold.value = options.normalThreshold;
    }

    if (options.depthCutoff !== undefined) {
      this.depthCutoff.value = options.depthCutoff;
    }

    if (options.edgeThreshold !== undefined) {
      this.edgeThreshold.value = options.edgeThreshold;
    }

    if (options.edges !== undefined) {
      this.edges.value = options.edges;
    }

    if (options.fill !== undefined) {
      this.fill.value = options.fill;
    }

    if (options.exposure !== undefined) {
      this.exposure.value = options.exposure;
    }

    if (options.attenuation !== undefined) {
      this.attenuation.value = options.attenuation;
    }

    if (options.invertLuminance !== undefined) {
      this.invertLuminance.value = options.invertLuminance;
    }

    if (options.asciiColor !== undefined) {
      this.asciiColor.value.copy(colorValue(options.asciiColor, 0xffffff));
    }

    if (options.backgroundColor !== undefined) {
      this.backgroundColor.value.copy(colorValue(options.backgroundColor, 0x000000));
    }

    if (options.blendWithBase !== undefined) {
      this.blendWithBase.value = options.blendWithBase;
    }

    if (options.depthFalloff !== undefined) {
      this.depthFalloff.value = options.depthFalloff;
    }

    if (options.depthOffset !== undefined) {
      this.depthOffset.value = options.depthOffset;
    }

    if (options.viewDog !== undefined) {
      this.viewDog.value = options.viewDog;
    }

    if (options.viewUncompressed !== undefined) {
      this.viewUncompressed.value = options.viewUncompressed;
    }

    if (options.viewEdges !== undefined) {
      this.viewEdges.value = options.viewEdges;
    }
  }

  setRenderProfile(profile: AcerolaAsciiRenderProfile): void {
    this.renderProfile = profile;
  }

  setSize(width: number, height: number): void {
    const scaledWidth = Math.max(1, Math.round(width * this.resolutionScale));
    const scaledHeight = Math.max(1, Math.round(height * this.resolutionScale));
    const downscaleWidth = Math.max(1, Math.floor(scaledWidth / 8));
    const downscaleHeight = Math.max(1, Math.floor(scaledHeight / 8));
    if (
      scaledWidth === this.targetScaledWidth &&
      scaledHeight === this.targetScaledHeight &&
      downscaleWidth === this.targetDownscaleWidth &&
      downscaleHeight === this.targetDownscaleHeight
    ) {
      return;
    }
    this.targetScaledWidth = scaledWidth;
    this.targetScaledHeight = scaledHeight;
    this.targetDownscaleWidth = downscaleWidth;
    this.targetDownscaleHeight = downscaleHeight;

    this.renderSize.value.set(scaledWidth, scaledHeight);
    this.inverseRenderSize.value.set(1 / scaledWidth, 1 / scaledHeight);
    this.downscaleSize.value.set(downscaleWidth, downscaleHeight);

    this.luminanceTarget.setSize(scaledWidth, scaledHeight);
    this.blurTarget.setSize(scaledWidth, scaledHeight);
    this.dogTarget.setSize(scaledWidth, scaledHeight);
    this.normalsTarget.setSize(scaledWidth, scaledHeight);
    this.edgesTarget.setSize(scaledWidth, scaledHeight);
    this.sobelXTarget.setSize(scaledWidth, scaledHeight);
    this.sobelTarget.setSize(scaledWidth, scaledHeight);
    this.asciiTarget.setSize(scaledWidth, scaledHeight);
    this.downscaleTarget.setSize(downscaleWidth, downscaleHeight);
  }

  updateBefore(frame: NodeFrame): undefined {
    const { renderer } = frame;
    if (!renderer) return;

    if (!this.asciiMaterial) {
      this.setup();
    }

    _rendererState = resetRendererState(renderer, _rendererState);

    renderer.getDrawingBufferSize(_renderSize);
    this.setSize(_renderSize.x, _renderSize.y);

    const textureType = this.colorNode.value.type;
    for (
      const target of [
        this.luminanceTarget,
        this.downscaleTarget,
        this.blurTarget,
        this.dogTarget,
        this.normalsTarget,
        this.edgesTarget,
        this.sobelXTarget,
        this.sobelTarget,
        this.asciiTarget,
      ]
    ) {
      target.texture.type = textureType;
    }

    const clipCamera = this.camera as Camera & { near?: number; far?: number };
    this.cameraNear.value = clipCamera.near ?? 0.1;
    this.cameraFar.value = clipCamera.far ?? 1000;

    const renderImage = this.renderProfile.image;
    const renderEdges = renderImage || this.renderProfile.terminalEdges;
    const renderNormals = renderEdges || this.renderProfile.terminalDepthColor;

    if (renderEdges) {
      this.renderMaterial(renderer, this.luminanceTarget, this.luminanceMaterial, "Acerola ASCII [Luminance]");
    }
    this.renderMaterial(renderer, this.downscaleTarget, this.downscaleMaterial, "Acerola ASCII [Downscale]");
    if (renderEdges) {
      this.renderMaterial(renderer, this.blurTarget, this.blurMaterial, "Acerola ASCII [Horizontal Blur]");
      this.renderMaterial(renderer, this.dogTarget, this.dogMaterial, "Acerola ASCII [DoG]");
    }
    if (renderNormals) {
      this.renderMaterial(renderer, this.normalsTarget, this.normalsMaterial, "Acerola ASCII [Normals]");
    }
    if (renderEdges) {
      this.renderMaterial(renderer, this.edgesTarget, this.edgesMaterial, "Acerola ASCII [Edge Detect]");
      this.renderMaterial(renderer, this.sobelXTarget, this.sobelXMaterial, "Acerola ASCII [Horizontal Sobel]");
      this.renderMaterial(renderer, this.sobelTarget, this.sobelMaterial, "Acerola ASCII [Vertical Sobel]");
    }
    if (shouldRenderAcerolaAsciiComposite(this.renderProfile)) {
      this.renderMaterial(renderer, this.asciiTarget, this.asciiMaterial, "Acerola ASCII [Composite]");
    }

    RendererUtils.restoreRendererState(renderer, _rendererState);
  }

  getTextureNode(): TextureNode {
    return this.outputTextureNode;
  }

  setup(): TextureNode {
    if (!this.luminanceMaterial) {
      const sourceSample = (uvNode: Node<"vec2">) => {
        const transformed = uvNode.mul(2).sub(1)
          .add(vec2(this.offset.x.negate(), this.offset.y).mul(2))
          .mul(this.zoom)
          .mul(0.5)
          .add(0.5)
          .toVar();
        const sample = vec4(0).toVar();

        If(
          transformed.greaterThanEqual(0).all().and(transformed.lessThanEqual(1).all()),
          () => {
            sample.assign(this.colorNode.sample(transformed));
          },
        );

        return sample;
      };

      const sourceLinearDepth = (uvNode: Node<"vec2">) => {
        const transformed = uvNode.mul(2).sub(1)
          .add(vec2(this.offset.x.negate(), this.offset.y).mul(2))
          .mul(this.zoom)
          .mul(0.5)
          .add(0.5)
          .toVar();
        const rawDepth = float(1).toVar();

        If(
          transformed.greaterThanEqual(0).all().and(transformed.lessThanEqual(1).all()),
          () => {
            rawDepth.assign(this.depthNode.sample(transformed).r);
          },
        );

        if ("isPerspectiveCamera" in this.camera && this.camera.isPerspectiveCamera) {
          const viewZ = perspectiveDepthToViewZ(rawDepth, this.cameraNear, this.cameraFar);
          return viewZToOrthographicDepth(viewZ, this.cameraNear, this.cameraFar);
        }

        return rawDepth;
      };

      const sampleNearest = (textureNode: TextureNode, pixelCoord: Node<"vec2">, sizeNode: Node<"vec2">) => {
        const texel = clamp(pixelCoord, vec2(0), sizeNode.sub(1));
        return textureNode.sample(texel.add(0.5).div(sizeNode));
      };

      const gaussian = (sigmaNode: Node<"float">, position: number) => {
        const sigmaSquared = sigmaNode.mul(sigmaNode);
        const coefficient = float(1).div(sqrt(float(2).mul(PI).mul(sigmaSquared)));
        return coefficient.mul(exp(float(-(position * position)).div(float(2).mul(sigmaSquared))));
      };

      const classifyDirection = (thetaNode: Node<"float">, validNode: Node<"float">) => {
        const direction = float(-1).toVar();
        const absTheta = abs(thetaNode).div(PI).toVar();

        If(validNode.greaterThan(0.5), () => {
          If(
            absTheta.lessThan(0.05).or(absTheta.greaterThan(0.9).and(absTheta.lessThanEqual(1))),
            () => {
              direction.assign(0);
            },
          )
            .ElseIf(absTheta.greaterThan(0.45).and(absTheta.lessThan(0.55)), () => {
              direction.assign(1);
            })
            .ElseIf(absTheta.greaterThan(0.05).and(absTheta.lessThan(0.45)), () => {
              direction.assign(thetaNode.greaterThan(0).select(3, 2));
            })
            .ElseIf(absTheta.greaterThan(0.55).and(absTheta.lessThan(0.9)), () => {
              direction.assign(thetaNode.greaterThan(0).select(2, 3));
            });
        });

        return direction;
      };

      const luminancePass = Fn(() => {
        return vec4(luminance(saturate(sourceSample(uv()).rgb)), 0, 0, 1);
      });

      const downscalePass = Fn(() => {
        const color = saturate(sourceSample(uv())).toVar();
        return vec4(color.rgb, luminance(color.rgb));
      });

      const horizontalBlurPass = Fn(() => {
        const texelSize = this.inverseRenderSize;
        const blur = vec2(0).toVar();
        const kernelSum = vec2(0).toVar();

        for (let offset = -10; offset <= 10; offset += 1) {
          const distance = Math.abs(offset);
          const luminanceValue = this.luminanceTextureNode.sample(
            uv().add(vec2(float(offset).mul(texelSize.x), 0)),
          ).r;
          const weights = vec2(
            gaussian(this.sigma, offset),
            gaussian(this.sigma.mul(this.sigmaScale), offset),
          );

          If(float(distance).lessThanEqual(this.kernelSize), () => {
            blur.addAssign(vec2(luminanceValue).mul(weights));
            kernelSum.addAssign(weights);
          });
        }

        const normalized = blur.div(max(kernelSum, vec2(0.0001)));
        return vec4(normalized, 0, 1);
      });

      const dogPass = Fn(() => {
        const texelSize = this.inverseRenderSize;
        const blur = vec2(0).toVar();
        const kernelSum = vec2(0).toVar();

        for (let offset = -10; offset <= 10; offset += 1) {
          const distance = Math.abs(offset);
          const luminanceValue = this.blurTextureNode.sample(
            uv().add(vec2(0, float(offset).mul(texelSize.y))),
          ).rg;
          const weights = vec2(
            gaussian(this.sigma, offset),
            gaussian(this.sigma.mul(this.sigmaScale), offset),
          );

          If(float(distance).lessThanEqual(this.kernelSize), () => {
            blur.addAssign(luminanceValue.mul(weights));
            kernelSum.addAssign(weights);
          });
        }

        const normalized = blur.div(max(kernelSum, vec2(0.0001)));
        const difference = normalized.x.sub(this.tau.mul(normalized.y)).toVar();
        return vec4(difference.greaterThanEqual(this.threshold).select(1, 0), 0, 0, 1);
      });

      const normalsPass = Fn(() => {
        const texelSize = this.inverseRenderSize;
        const centerUv = uv().toVar();
        const northUv = centerUv.sub(vec2(0, texelSize.y));
        const eastUv = centerUv.add(vec2(texelSize.x, 0));

        const centerDepth = sourceLinearDepth(centerUv).toVar();
        const northDepth = sourceLinearDepth(northUv);
        const eastDepth = sourceLinearDepth(eastUv);

        const centerPosition = vec3(centerUv.sub(0.5), 1).mul(centerDepth).toVar();
        const northPosition = vec3(northUv.sub(0.5), 1).mul(northDepth).toVar();
        const eastPosition = vec3(eastUv.sub(0.5), 1).mul(eastDepth).toVar();

        return vec4(normalize(cross(centerPosition.sub(northPosition), centerPosition.sub(eastPosition))), centerDepth);
      });

      const edgePass = Fn(() => {
        const texelSize = this.inverseRenderSize;
        const center = this.normalsTextureNode.sample(uv()).toVar();
        const left = texelSize.x.negate();
        const up = texelSize.y.negate();
        const samples = [
          this.normalsTextureNode.sample(uv().add(vec2(left, 0))),
          this.normalsTextureNode.sample(uv().add(vec2(texelSize.x, 0))),
          this.normalsTextureNode.sample(uv().add(vec2(0, up))),
          this.normalsTextureNode.sample(uv().add(vec2(0, texelSize.y))),
          this.normalsTextureNode.sample(uv().add(vec2(left, up))),
          this.normalsTextureNode.sample(uv().add(vec2(texelSize.x, up))),
          this.normalsTextureNode.sample(uv().add(vec2(left, texelSize.y))),
          this.normalsTextureNode.sample(uv().add(vec2(texelSize.x, texelSize.y))),
        ];

        const depthSum = float(0).toVar();
        const normalSum = vec3(0).toVar();

        for (const sample of samples) {
          depthSum.addAssign(abs(sample.a.sub(center.a)));
          normalSum.addAssign(abs(sample.rgb.sub(center.rgb)));
        }

        const output = float(0).toVar();

        If(this.useDepth.and(depthSum.greaterThan(this.depthThreshold)), () => {
          output.assign(1);
        });

        If(this.useNormals.and(normalSum.dot(vec3(1)).greaterThan(this.normalThreshold)), () => {
          output.assign(1);
        });

        const dog = this.dogTextureNode.sample(uv()).r;

        return vec4(saturate(abs(dog.sub(output))), 0, 0, 1);
      });

      const sobelXPass = Fn(() => {
        const texelSize = this.inverseRenderSize;
        const left = this.edgesTextureNode.sample(uv().sub(vec2(texelSize.x, 0))).r;
        const center = this.edgesTextureNode.sample(uv()).r;
        const right = this.edgesTextureNode.sample(uv().add(vec2(texelSize.x, 0))).r;

        const gx = float(3).mul(left).sub(float(3).mul(right));
        const gy = float(3).mul(left).add(float(10).mul(center)).add(float(3).mul(right));

        return vec4(gx, gy, 0, 1);
      });

      const sobelPass = Fn(() => {
        const texelSize = this.inverseRenderSize;
        const grad1 = this.sobelXTextureNode.sample(uv().sub(vec2(0, texelSize.y))).rg;
        const grad2 = this.sobelXTextureNode.sample(uv()).rg;
        const grad3 = this.sobelXTextureNode.sample(uv().add(vec2(0, texelSize.y))).rg;

        const gx = float(3).mul(grad1.x).add(float(10).mul(grad2.x)).add(float(3).mul(grad3.x)).toVar();
        const gy = float(3).mul(grad1.y).sub(float(3).mul(grad3.y)).toVar();
        const magnitude = sqrt(gx.mul(gx).add(gy.mul(gy))).toVar();
        const theta = float(0).toVar();
        const valid = float(0).toVar();
        const linearDepth = sourceLinearDepth(uv());

        If(magnitude.greaterThan(0.00001), () => {
          theta.assign(mx_atan2(gy, gx));
          valid.assign(1);
        });

        If(this.depthCutoff.greaterThan(0).and(linearDepth.mul(1000).greaterThan(this.depthCutoff)), () => {
          theta.assign(0);
          valid.assign(0);
        });

        return vec4(theta, valid, 0, 1);
      });

      const asciiPass = Fn(() => {
        const pixelCoord = uv().mul(this.renderSize).floor().toVar();
        const tileBase = pixelCoord.div(8).floor().mul(8).toVar();
        const localCoord = mod(pixelCoord, 8).toVar();

        const currentSobel = sampleNearest(this.sobelTextureNode, pixelCoord, this.renderSize);
        const currentDirection = classifyDirection(currentSobel.r, currentSobel.g);

        const bucket0 = float(0).toVar();
        const bucket1 = float(0).toVar();
        const bucket2 = float(0).toVar();
        const bucket3 = float(0).toVar();

        for (let row = 0; row < 8; row += 1) {
          for (let column = 0; column < 8; column += 1) {
            const coord = tileBase.add(vec2(column, row));
            const sobel = sampleNearest(this.sobelTextureNode, coord, this.renderSize);
            const direction = classifyDirection(sobel.r, sobel.g);

            If(direction.greaterThanEqual(0), () => {
              If(direction.equal(0), () => {
                bucket0.addAssign(1);
              })
                .ElseIf(direction.equal(1), () => {
                  bucket1.addAssign(1);
                })
                .ElseIf(direction.equal(2), () => {
                  bucket2.addAssign(1);
                })
                .Else(() => {
                  bucket3.addAssign(1);
                });
            });
          }
        }

        const dominantDirection = float(-1).toVar();
        const maxCount = float(0).toVar();

        const updateDominant = (direction: number, count: Node<"float">) => {
          If(count.greaterThan(maxCount), () => {
            dominantDirection.assign(direction);
            maxCount.assign(count);
          });
        };

        updateDominant(0, bucket0);
        updateDominant(1, bucket1);
        updateDominant(2, bucket2);
        updateDominant(3, bucket3);

        If(maxCount.lessThan(this.edgeThreshold), () => {
          dominantDirection.assign(-1);
        });

        const displayDirection = this.viewUncompressed.select(currentDirection, dominantDirection).toVar();
        const downscaleCoord = pixelCoord.div(8).floor().toVar();
        const downscaleInfo = sampleNearest(this.downscaleTextureNode, downscaleCoord, this.downscaleSize).toVar();

        const edgeMask = float(0).toVar();
        const edgeGlyphCoord = vec2(
          localCoord.x.add(displayDirection.add(1).mul(8)),
          float(7).sub(localCoord.y),
        );

        If(displayDirection.greaterThanEqual(0).and(this.edges), () => {
          edgeMask.assign(sampleNearest(this.edgesLutNode, edgeGlyphCoord, vec2(40, 8)).r);
        });

        const fillMask = float(0).toVar();
        const fillBucket = max(
          0,
          min(
            9,
            floor(saturate(pow(downscaleInfo.a.mul(this.exposure), this.attenuation)).sub(0.000001).mul(10)).sub(1),
          ),
        ).toVar();
        const correctedFillBucket = this.invertLuminance.select(float(9).sub(fillBucket), fillBucket).toVar();
        const fillGlyphCoord = vec2(localCoord.x.add(correctedFillBucket.mul(8)), localCoord.y);

        If(this.fill, () => {
          fillMask.assign(sampleNearest(this.fillLutNode, fillGlyphCoord, vec2(80, 8)).r);
        });

        const asciiMask = float(0).toVar();
        If(displayDirection.greaterThanEqual(0).and(this.edges), () => {
          asciiMask.assign(edgeMask);
        }).ElseIf(this.fill, () => {
          asciiMask.assign(fillMask);
        });

        const baseAsciiColor = mix(colorVec3(this.asciiColor), downscaleInfo.rgb, this.blendWithBase).toVar();
        const asciiColor = mix(colorVec3(this.backgroundColor), baseAsciiColor, asciiMask).toVar();

        const centerDepth = sampleNearest(this.normalsTextureNode, tileBase.add(4), this.renderSize).a;
        const z = centerDepth.mul(1000);
        const fogValue = this.depthFalloff.mul(0.005 / Math.sqrt(Math.log(2))).mul(max(0, z.sub(this.depthOffset)))
          .toVar();
        const fogFactor = exp2(fogValue.mul(fogValue).negate()).toVar();

        asciiColor.assign(mix(colorVec3(this.backgroundColor), asciiColor, fogFactor));

        If(this.viewDog, () => {
          asciiColor.assign(vec3(sampleNearest(this.edgesTextureNode, pixelCoord, this.renderSize).r));
        });

        If(this.viewEdges.or(this.viewUncompressed), () => {
          asciiColor.assign(vec3(0));

          If(displayDirection.equal(0), () => {
            asciiColor.assign(vec3(1, 0, 0));
          })
            .ElseIf(displayDirection.equal(1), () => {
              asciiColor.assign(vec3(0, 1, 0));
            })
            .ElseIf(displayDirection.equal(2), () => {
              asciiColor.assign(vec3(0, 1, 1));
            })
            .ElseIf(displayDirection.equal(3), () => {
              asciiColor.assign(vec3(1, 1, 0));
            });
        });

        return vec4(asciiColor, 1);
      });

      const makeMaterial = (name: string, fragmentNode: TslFragmentFactory) => {
        const material = new NodeMaterial();
        material.name = name;
        material.fragmentNode = fragmentNode();
        return material;
      };

      this.luminanceMaterial = makeMaterial("AcerolaAscii.luminance", luminancePass);
      this.downscaleMaterial = makeMaterial("AcerolaAscii.downscale", downscalePass);
      this.blurMaterial = makeMaterial("AcerolaAscii.blur", horizontalBlurPass);
      this.dogMaterial = makeMaterial("AcerolaAscii.dog", dogPass);
      this.normalsMaterial = makeMaterial("AcerolaAscii.normals", normalsPass);
      this.edgesMaterial = makeMaterial("AcerolaAscii.edges", edgePass);
      this.sobelXMaterial = makeMaterial("AcerolaAscii.sobelX", sobelXPass);
      this.sobelMaterial = makeMaterial("AcerolaAscii.sobel", sobelPass);
      this.asciiMaterial = makeMaterial("AcerolaAscii.composite", asciiPass);
    }

    return this.outputTextureNode;
  }

  dispose(): void {
    for (
      const target of [
        this.luminanceTarget,
        this.downscaleTarget,
        this.blurTarget,
        this.dogTarget,
        this.normalsTarget,
        this.edgesTarget,
        this.sobelXTarget,
        this.sobelTarget,
        this.asciiTarget,
      ]
    ) {
      target.dispose();
    }

    this.luminanceMaterial?.dispose();
    this.downscaleMaterial?.dispose();
    this.blurMaterial?.dispose();
    this.dogMaterial?.dispose();
    this.normalsMaterial?.dispose();
    this.edgesMaterial?.dispose();
    this.sobelXMaterial?.dispose();
    this.sobelMaterial?.dispose();
    this.asciiMaterial?.dispose();
  }

  private renderMaterial(
    renderer: Renderer,
    target: RenderTarget,
    material?: NodeMaterial,
    label = "AcerolaAscii",
  ): void {
    if (!material) return;

    _quadMesh.material = material;
    _quadMesh.name = label;
    renderer.setRenderTarget(target);
    _quadMesh.render(renderer);
  }
}
