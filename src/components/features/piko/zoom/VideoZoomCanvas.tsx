'use client';

import React, { useEffect, useRef } from 'react';
import type { NormalizedRoi } from '@/types/zoom-window';

export interface VideoZoomCanvasProps {
  video: HTMLVideoElement | null;
  width: number;
  height: number;
  roi: NormalizedRoi; // normalized over the source video frame
  className?: string;
}

/**
 * Lightweight WebGL2 canvas that samples a sub-rectangle (ROI) of a shared video
 * texture and renders it to fit the canvas while preserving aspect ratio.
 */
export const VideoZoomCanvas: React.FC<VideoZoomCanvasProps> = ({
  video,
  width,
  height,
  roi,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const texRef = useRef<WebGLTexture | null>(null);
  const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('webgl2');
    if (!(ctx && ctx instanceof WebGL2RenderingContext)) return;
    const gl2: WebGL2RenderingContext = ctx;
    glRef.current = gl2;

    const vsSrc = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = (aPos + 1.0) * 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
    const fsSrc = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec4 uRoi; // x,y,w,h normalized in source texture space
uniform vec2 uTexSize;

void main(){
  vec2 uv = uRoi.xy + vUv * uRoi.zw;
  if(any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))){
    fragColor = vec4(0.0,0.0,0.0,1.0);
    return;
  }
  fragColor = texture(uTex, uv);
}`;

    function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
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
    const vs = compile(gl2, gl2.VERTEX_SHADER, vsSrc);
    const fs = compile(gl2, gl2.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return;
    const prog = gl2.createProgram();
    if (!prog) return;
    gl2.attachShader(prog, vs);
    gl2.attachShader(prog, fs);
    gl2.bindAttribLocation(prog, 0, 'aPos');
    gl2.linkProgram(prog);
    if (!gl2.getProgramParameter(prog, gl2.LINK_STATUS)) {
      console.error(gl2.getProgramInfoLog(prog));
      return;
    }
    progRef.current = prog;

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]);
    const vbo = gl2.createBuffer();
    gl2.bindBuffer(gl2.ARRAY_BUFFER, vbo);
    gl2.bufferData(gl2.ARRAY_BUFFER, quad, gl2.STATIC_DRAW);
    const vao = gl2.createVertexArray();
    vaoRef.current = vao;
    gl2.bindVertexArray(vao);
    gl2.enableVertexAttribArray(0);
    gl2.vertexAttribPointer(0, 2, gl2.FLOAT, false, 0, 0);

    const tex = gl2.createTexture();
    texRef.current = tex;
    gl2.bindTexture(gl2.TEXTURE_2D, tex);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);

    const render = () => {
      if (!video || !video.videoWidth || !video.videoHeight) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Compute viewport to preserve full ROI aspect within canvas
      const roiPxW = vw * Math.max(0, Math.min(1, roi.w));
      const roiPxH = vh * Math.max(0, Math.min(1, roi.h));
      const roiAspect = roiPxW / Math.max(1, roiPxH);
      const canvasAspect = width / Math.max(1, height);
      let vpW: number, vpH: number, vpX: number, vpY: number;
      if (roiAspect > canvasAspect) {
        vpW = width;
        vpH = Math.floor(width / roiAspect);
        vpX = 0;
        vpY = Math.floor((height - vpH) / 2);
      } else {
        vpW = Math.floor(height * roiAspect);
        vpH = height;
        vpX = Math.floor((width - vpW) / 2);
        vpY = 0;
      }

      gl2.viewport(vpX, vpY, vpW, vpH);
      gl2.clearColor(0, 0, 0, 1);
      gl2.clear(gl2.COLOR_BUFFER_BIT);

      gl2.bindTexture(gl2.TEXTURE_2D, tex);
      // Ensure HTMLVideoElement is uploaded with top-left origin
      gl2.pixelStorei(gl2.UNPACK_FLIP_Y_WEBGL, true);
      gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, video);
      gl2.useProgram(progRef.current!);

      const uRoi = gl2.getUniformLocation(progRef.current!, 'uRoi');
      const uTexSize = gl2.getUniformLocation(progRef.current!, 'uTexSize');
      gl2.uniform4f(
        uRoi,
        Math.max(0, Math.min(1, roi.x)),
        Math.max(0, Math.min(1, roi.y)),
        Math.max(0, Math.min(1, roi.w)),
        Math.max(0, Math.min(1, roi.h))
      );
      gl2.uniform2f(uTexSize, vw, vh);

      gl2.bindVertexArray(vaoRef.current);
      gl2.drawArrays(gl2.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (vaoRef.current) gl2.deleteVertexArray(vaoRef.current);
      if (progRef.current) gl2.deleteProgram(progRef.current);
      if (texRef.current) gl2.deleteTexture(texRef.current);
      glRef.current = null;
      progRef.current = null;
      texRef.current = null;
    };
  }, [video, width, height, roi]);

  return <canvas ref={canvasRef} className={className} />;
};
