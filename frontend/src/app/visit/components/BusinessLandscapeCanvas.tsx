"use client";

import { useEffect, useRef, useState } from "react";
import type { Language } from "../types";
import { translations } from "../translations";

type Vec3 = [number, number, number];
type Box = { position: Vec3; size: Vec3; color: [number, number, number] };

const vertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uViewProjection;
varying vec3 vNormal;
void main() { vNormal = aNormal; gl_Position = uViewProjection * vec4(aPosition, 1.0); }
`;
const fragmentShader = `
precision mediump float;
uniform vec3 uColor;
varying vec3 vNormal;
void main() { vec3 n = normalize(vNormal); float light = 0.48 + 0.52 * max(dot(n, normalize(vec3(-0.45, 0.8, 0.55))), 0.0); gl_FragColor = vec4(uColor * light, 1.0); }
`;

function makeBoxes(): Box[] {
  const boxes: Box[] = [
    { position: [0, -0.17, 0], size: [10, 0.24, 7], color: [0.22, 0.27, 0.23] },
    // Fine paths connect the work between each place.
    { position: [-1.35, 0.015, -0.85], size: [1.12, 0.025, 0.035], color: [0.75, 0.45, 0.27] },
    { position: [1.0, 0.015, 0.08], size: [1.48, 0.025, 0.035], color: [0.75, 0.45, 0.27] },
    { position: [-0.25, 0.02, 1.28], size: [1.43, 0.025, 0.035], color: [0.75, 0.45, 0.27] },
    // Small architectural cluster: a warung, a homestay, a dock and shaded awnings.
    { position: [-2.4, 0.42, -0.65], size: [2.0, 0.95, 1.65], color: [0.72, 0.56, 0.35] },
    { position: [-2.4, 1.12, -0.65], size: [2.15, 0.15, 1.8], color: [0.22, 0.28, 0.24] },
    { position: [-2.4, 0.88, 0.25], size: [1.25, 0.12, 0.16], color: [0.82, 0.38, 0.24] },
    { position: [-2.84, 0.47, 0.19], size: [0.34, 0.32, 0.055], color: [0.36, 0.51, 0.46] },
    { position: [-1.97, 0.47, 0.19], size: [0.34, 0.32, 0.055], color: [0.36, 0.51, 0.46] },
    { position: [-2.4, 0.27, 0.205], size: [0.32, 0.62, 0.07], color: [0.33, 0.38, 0.3] },
    { position: [0.25, 0.67, -1.1], size: [1.8, 1.45, 1.55], color: [0.82, 0.76, 0.62] },
    { position: [0.25, 1.48, -1.1], size: [1.94, 0.16, 1.68], color: [0.31, 0.39, 0.31] },
    { position: [-0.18, 0.74, -0.295], size: [0.34, 0.42, 0.06], color: [0.45, 0.57, 0.51] },
    { position: [0.68, 0.74, -0.295], size: [0.34, 0.42, 0.06], color: [0.45, 0.57, 0.51] },
    { position: [0.25, 0.14, -0.28], size: [0.4, 0.6, 0.07], color: [0.46, 0.39, 0.29] },
    { position: [1.75, 0.31, 1.25], size: [2.2, 0.56, 1.05], color: [0.55, 0.61, 0.49] },
    { position: [-3.62, 0.36, 1.7], size: [0.36, 0.68, 0.32], color: [0.27, 0.35, 0.29] },
    { position: [-3.1, 0.36, 1.7], size: [0.36, 0.68, 0.32], color: [0.27, 0.35, 0.29] },
    // Objects that suggest the work around the place.
    { position: [-0.9, 0.08, 0.9], size: [0.7, 0.07, 0.48], color: [0.76, 0.68, 0.53] },
    { position: [0.9, 0.08, 1.0], size: [0.48, 0.08, 0.32], color: [0.86, 0.42, 0.26] },
    { position: [3.3, 0.28, -1.7], size: [0.72, 0.55, 0.12], color: [0.24, 0.31, 0.29] },
    { position: [3.3, 0.60, -1.7], size: [0.58, 0.06, 0.08], color: [0.82, 0.66, 0.40] },
  ];
  return boxes;
}

function cubeData(): { positions: number[]; normals: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const faces: [Vec3, Vec3[]][] = [
    [[0, 0, 1], [[-1,-1,1],[1,-1,1],[1,1,1],[-1,-1,1],[1,1,1],[-1,1,1]]],
    [[0, 0, -1], [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1]]],
    [[1, 0, 0], [[1,-1,1],[1,-1,-1],[1,1,-1],[1,-1,1],[1,1,-1],[1,1,1]]],
    [[-1, 0, 0], [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,-1,-1],[-1,1,1],[-1,1,-1]]],
    [[0, 1, 0], [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,1],[1,1,-1],[-1,1,-1]]],
    [[0, -1, 0], [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,-1],[1,-1,1],[-1,-1,1]]],
  ];
  for (const [normal, points] of faces) for (const point of points) { positions.push(...point); normals.push(...normal); }
  return { positions, normals };
}

function perspective(fov: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
}
function lookAt(eye: Vec3, target: Vec3): number[] {
  const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const norm=(v:Vec3):Vec3=>{const l=Math.hypot(...v)||1;return [v[0]/l,v[1]/l,v[2]/l];};
  const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const z=norm(sub(eye,target)), x=norm(cross([0,1,0],z)), y=cross(z,x);
  return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),-(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),-(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1];
}
function multiply(a:number[],b:number[]):number[]{const out=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}

export function BusinessLandscapeCanvas({ language }: { language: Language }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const t = translations[language];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true, powerPreference: "low-power" });
    if (!gl) { setWebglFailed(true); return; }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL shader unavailable");
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader error");
      return shader;
    };
    let program: WebGLProgram | null = null;
    try {
      program = gl.createProgram();
      if (!program) throw new Error("WebGL program unavailable");
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Link error");
    } catch { setWebglFailed(true); return; }

    gl.useProgram(program);
    const geometry = cubeData();
    const buffer = (data: number[], name: string, size: number) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program!, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    buffer(geometry.positions, "aPosition", 3); buffer(geometry.normals, "aNormal", 3);
    const vpLocation = gl.getUniformLocation(program, "uViewProjection");
    const colorLocation = gl.getUniformLocation(program, "uColor");
    const boxes = makeBoxes();
    let visible = false, frame = 0, pointerX = 0, pointerY = 0, targetX = 0, targetY = 0, down = false, lastX = 0, lastY = 0, auto = 0, scrollProgress = 0;
    const handleScroll = () => {
      const rect = canvas.getBoundingClientRect();
      scrollProgress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !visible) { visible = true; frame = requestAnimationFrame(draw); }
      else if (!entry.isIntersecting) { visible = false; cancelAnimationFrame(frame); }
    }, { threshold: 0.01 });
    observer.observe(canvas);
    const resize = () => { const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5); canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));gl.viewport(0,0,canvas.width,canvas.height); };
    const downHandler=(e:PointerEvent)=>{down=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);};
    const moveHandler=(e:PointerEvent)=>{if(down){targetX+=(e.clientX-lastX)*0.006;targetY+=(e.clientY-lastY)*0.004;lastX=e.clientX;lastY=e.clientY;}};
    const upHandler=()=>{down=false;};
    canvas.addEventListener("pointerdown",downHandler);canvas.addEventListener("pointermove",moveHandler);canvas.addEventListener("pointerup",upHandler);canvas.addEventListener("pointercancel",upHandler);
    const draw=()=>{
      if(!visible)return;
      frame=requestAnimationFrame(draw);
      if(!reducedMotion && !down) auto+=0.0018;
      pointerX+=(targetX-pointerX)*0.06;pointerY+=(targetY-pointerY)*0.06;
      const rect=canvas.getBoundingClientRect(), aspect=rect.width/Math.max(1,rect.height);
      const scrollMotion = reducedMotion ? 0 : scrollProgress;
      const angle=-0.66+pointerX+auto+scrollMotion*0.28, radius=13.2-scrollMotion*1.2;
      const eye:[number,number,number]=[Math.sin(angle)*radius,7+pointerY*4+scrollMotion*0.9,Math.cos(angle)*radius];
      const vp=multiply(perspective(0.65,aspect,0.1,60),lookAt(eye,[0,0.35,0]));
      gl.clearColor(0.89,0.84,0.74,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
      gl.uniformMatrix4fv(vpLocation,false,new Float32Array(vp));
      for(const box of boxes){
        const [x,y,z]=box.position,[sx,sy,sz]=box.size;
        const model=[sx,0,0,0,0,sy,0,0,0,0,sz,0,x,y,z,1];
        gl.uniformMatrix4fv(vpLocation,false,new Float32Array(multiply(vp,model)));
        gl.uniform3fv(colorLocation,new Float32Array(box.color));
        gl.drawArrays(gl.TRIANGLES,0,36);
      }
    };
    resize();handleScroll();window.addEventListener("resize",resize);window.addEventListener("scroll",handleScroll,{passive:true});
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("resize",resize);window.removeEventListener("scroll",handleScroll);canvas.removeEventListener("pointerdown",downHandler);canvas.removeEventListener("pointermove",moveHandler);canvas.removeEventListener("pointerup",upHandler);canvas.removeEventListener("pointercancel",upHandler);gl.getExtension("WEBGL_lose_context")?.loseContext();};
  }, [reducedMotion]);

  return (
    <div className="relative isolate h-[370px] w-full overflow-hidden rounded-[1.75rem] border border-[#6b7664]/35 bg-[#e4ddcf] shadow-[0_30px_90px_rgba(30,39,31,.18)] sm:h-[500px] lg:h-[610px]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_55%_28%,rgba(255,249,231,.95),transparent_55%),linear-gradient(155deg,#e8e2d6,#d5d0c3)]" />
      {!webglFailed && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label={t.sceneAlt} />}
      {webglFailed && <div className="absolute inset-0 grid place-items-center"><div className="flex items-end gap-4"><div className="h-32 w-40 rounded-t-[3rem] bg-[#b48c58] shadow-xl"/><div className="h-44 w-36 rounded-t-2xl bg-[#7d8a70] shadow-xl"/><div className="h-24 w-28 rounded-t-2xl bg-[#d37853] shadow-xl"/></div></div>}
      <div className="pointer-events-none absolute inset-x-5 top-5 flex items-center justify-between text-[10px] font-medium uppercase tracking-[.19em] text-[#364337] sm:inset-x-7 sm:top-7"><span>{t.sceneKicker}</span><span className="rounded-full border border-[#596b58]/25 bg-white/40 px-3 py-1.5">{webglFailed ? t.sceneStatic : t.sceneExplore}</span></div>
      <div className="pointer-events-none absolute bottom-5 left-5 max-w-[220px] rounded-xl border border-white/50 bg-[#f4f0e7]/80 px-4 py-3 text-xs leading-relaxed text-[#384237] backdrop-blur sm:bottom-7 sm:left-7"><span className="mb-1 block text-[9px] uppercase tracking-[.18em] text-[#94784d]">{t.sceneTitle}</span>{t.sceneBody}</div>
      {!reducedMotion && !webglFailed && <div className="pointer-events-none absolute bottom-7 right-7 hidden text-[9px] uppercase tracking-[.16em] text-[#53604f] sm:block">{t.sceneDrag}</div>}
    </div>
  );
}
