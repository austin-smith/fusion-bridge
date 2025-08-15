'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import type { DewarpSettings, LensModel } from '@/types/video-dewarp';

export interface VideoDewarpCanvasProps {
  video: HTMLVideoElement | null;
  width: number;
  height: number;
  settings: DewarpSettings;
  className?: string;
}

// Minimal WebGL-based dewarp using a full-screen quad
export const VideoDewarpCanvas: React.FC<VideoDewarpCanvasProps> = ({
  video,
  width,
  height,
  settings,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const texRef = useRef<WebGLTexture | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const rafRef = useRef<number | null>(null);
  const uploadErrorLoggedRef = useRef(false);

  const vertexSrc = useMemo(
    () => `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`,
    []
  );

  const fragmentSrc = useMemo(
    () => `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform vec2 uCenter;
uniform float uFocal;
uniform float uOutFov; // radians
uniform mat3 uR;
uniform int uLensModel; // 0=equidistant,1=equisolid,2=orthographic,3=stereographic

vec3 rayFromUV(vec2 uv){
  float f = tan(uOutFov * 0.5);
  float x = (uv.x * 2.0 - 1.0) * f;
  float y = (1.0 - uv.y * 2.0) * f;
  return normalize(vec3(x, y, -1.0));
}

float rFromTheta(float theta){
  if(uLensModel==0){
    return uFocal * theta; // equidistant
  } else if(uLensModel==1){
    return 2.0 * uFocal * sin(theta*0.5); // equisolid
  } else if(uLensModel==2){
    return uFocal * sin(theta); // orthographic
  } else {
    return 2.0 * uFocal * tan(theta*0.5); // stereographic
  }
}

void main(){
  vec3 d = rayFromUV(vUv);
  d = uR * d;
  float theta = acos(clamp(-d.z, -1.0, 1.0));
  float r = rFromTheta(theta);
  float phi = atan(d.y, d.x);
  vec2 p = uCenter + r * vec2(cos(phi), sin(phi));
  vec2 uv = p / uTexSize;
  if(any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))){
    fragColor = vec4(0.0,0.0,0.0,1.0);
    return;
  }
  vec3 c = texture(uTex, uv).rgb;
  fragColor = vec4(c,1.0);
}
`,
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) {
      console.warn('WebGL2 not available; dewarping disabled');
      return;
    }
    glRef.current = gl;

    function createShader(type: number, src: string) {
      if (!gl) return null;
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }
    const vs = createShader(gl.VERTEX_SHADER, vertexSrc);
    const fs = createShader(gl.FRAGMENT_SHADER, fragmentSrc);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    programRef.current = prog;

    // Quad
    const positions = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    // VAO (Vertex Array Object)
    const vao = gl.createVertexArray();
    vaoRef.current = vao;
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Texture
    const tex = gl.createTexture();
    texRef.current = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const render = () => {
      if (!video || !video.videoWidth || !video.videoHeight) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Resize canvas
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Calculate aspect ratio preservation (letterbox/pillarbox)
      const videoAspect = vw / vh;
      const containerAspect = width / height;
      
      let viewportWidth, viewportHeight, viewportX, viewportY;
      
      if (videoAspect > containerAspect) {
        // Video is wider - letterbox (black bars top/bottom)
        viewportWidth = width;
        viewportHeight = width / videoAspect;
        viewportX = 0;
        viewportY = (height - viewportHeight) / 2;
      } else {
        // Video is taller - pillarbox (black bars left/right)
        viewportWidth = height * videoAspect;
        viewportHeight = height;
        viewportX = (width - viewportWidth) / 2;
        viewportY = 0;
      }

      // Clear entire canvas to black
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Set viewport to correctly sized region
      gl.viewport(viewportX, viewportY, viewportWidth, viewportHeight);

      // Upload current frame
      gl.bindTexture(gl.TEXTURE_2D, tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } catch (err) {
        if (!uploadErrorLoggedRef.current) {
          console.error('WebGL texture upload failed:', err);
          uploadErrorLoggedRef.current = true;
        }
      }

      gl.useProgram(prog);
      const getLoc = (name: string) => gl.getUniformLocation(prog, name);

      const lensModelIndex = lensModelToIndex(settings.lensModel);
      const cx = settings.cx ?? vw * 0.5;
      const cy = settings.cy ?? vh * 0.5;
      const Rguess = Math.min(cx, cy);
      const f = settings.focalPx ?? Rguess / (Math.PI * 0.5);

      // Build rotation matrix from yaw(Z), pitch(X), roll(Y)
      const yaw = deg2rad(settings.yawDeg);
      const pitch = deg2rad(settings.pitchDeg);
      const roll = deg2rad(settings.rollDeg);
      const Ryaw = zRot(yaw);
      const Rpitch = xRot(pitch);
      const Rroll = yRot(roll);
      const R = mulMat3(mulMat3(Ryaw, Rpitch), Rroll);

      gl.uniform1i(getLoc('uLensModel'), lensModelIndex);
      gl.uniform2f(getLoc('uTexSize'), vw, vh);
      gl.uniform2f(getLoc('uCenter'), cx, cy);
      gl.uniform1f(getLoc('uFocal'), f);
      gl.uniform1f(getLoc('uOutFov'), deg2rad(settings.fovDeg));
      gl.uniformMatrix3fv(getLoc('uR'), false, R);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (vaoRef.current) {
        gl.deleteVertexArray(vaoRef.current);
        vaoRef.current = null;
      }
      if (programRef.current) gl.deleteProgram(programRef.current);
      if (texRef.current) gl.deleteTexture(texRef.current);
      glRef.current = null;
      programRef.current = null;
      texRef.current = null;
    };
  }, [video, width, height, vertexSrc, fragmentSrc, settings]);

  return <canvas ref={canvasRef} className={className} />;
};

function deg2rad(d: number): number { return (d * Math.PI) / 180; }
function lensModelToIndex(m: LensModel): number {
  switch (m) {
    case 'equidistant': return 0;
    case 'equisolid': return 1;
    case 'orthographic': return 2;
    case 'stereographic': return 3;
  }
}

// Column-major mat3 as Float32Array[9]
function mulMat3(A: Float32Array, B: Float32Array): Float32Array {
  const a = A, b = B;
  return new Float32Array([
    a[0]*b[0] + a[3]*b[1] + a[6]*b[2],
    a[1]*b[0] + a[4]*b[1] + a[7]*b[2],
    a[2]*b[0] + a[5]*b[1] + a[8]*b[2],
    a[0]*b[3] + a[3]*b[4] + a[6]*b[5],
    a[1]*b[3] + a[4]*b[4] + a[7]*b[5],
    a[2]*b[3] + a[5]*b[4] + a[8]*b[5],
    a[0]*b[6] + a[3]*b[7] + a[6]*b[8],
    a[1]*b[6] + a[4]*b[7] + a[7]*b[8],
    a[2]*b[6] + a[5]*b[7] + a[8]*b[8],
  ]);
}
function xRot(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    1, 0, 0,
    0, c, s,
    0, -s, c,
  ]);
}
function yRot(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    c, 0, -s,
    0, 1, 0,
    s, 0, c,
  ]);
}
function zRot(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([
    c, s, 0,
    -s, c, 0,
    0, 0, 1,
  ]);
}





