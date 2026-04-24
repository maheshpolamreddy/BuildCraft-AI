"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Renderer, Program, Mesh, Triangle, Color } from "ogl";

/** Internal framebuffer scale: 1 = full res (heavy). ~0.5 halves pixels (≈4× cheaper) with negligible visual loss on a blurred background. */
const RENDER_SCALE = 0.55;

interface ThreadsProps {
  color?: [number, number, number];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
}

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

const int u_line_count = 25;
const float u_line_width = 8.0;
const float u_line_blur = 15.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 18.0 + (mouse.x - 0.5) * 0.5;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    // Dynamic color gradient matching the logo (Blue + Emerald)
    vec3 colorBlue1 = vec3(0.31, 0.67, 1.0);    // #4facfe
    vec3 colorBlue2 = vec3(0.0, 0.95, 0.99);    // #00f2fe
    vec3 colorEmerald1 = vec3(0.20, 0.82, 0.60); // #34d399
    vec3 colorEmerald2 = vec3(0.06, 0.72, 0.50); // #10b981

    // Mix the colors based on time and screen space (uv)
    vec3 currentBlue = mix(colorBlue1, colorBlue2, sin(iTime * 1.2 + uv.x) * 0.5 + 0.5);
    vec3 currentEmerald = mix(colorEmerald1, colorEmerald2, cos(iTime * 1.5 - uv.y) * 0.5 + 0.5);
    
    // Fluidly transition across the screen and time between blue and emerald
    float colorMix = sin(iTime * 0.8 + uv.x * 2.5 + uv.y * 1.5) * 0.5 + 0.5;
    vec3 dynamicColor = mix(currentBlue, currentEmerald, colorMix);

    float colorVal = 1.0 - line_strength;
    fragColor = vec4(dynamicColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

function StaticThreadsBackdrop(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#050505] to-[#081a14]"
      aria-hidden
      {...props}
    />
  );
}

const Threads: React.FC<ThreadsProps> = ({
  color = [1, 1, 1],
  amplitude = 1,
  distance = 0,
  enableMouseInteraction = false,
  ...rest
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameId = useRef<number>(0);
  const [staticBackdrop, setStaticBackdrop] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setStaticBackdrop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (staticBackdrop || !containerRef.current) return;
    const container = containerRef.current;

    const renderer = new Renderer({
      alpha: true,
      antialias: false,
      dpr: 1,
      powerPreference: "low-power",
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height)
        },
        uColor: { value: new Color(...color) },
        uAmplitude: { value: amplitude },
        uDistance: { value: distance },
        uMouse: { value: new Float32Array([0.5, 0.5]) }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      if (!container) return;
      const { clientWidth, clientHeight } = container;
      const w = Math.max(1, Math.floor(clientWidth * RENDER_SCALE));
      const h = Math.max(1, Math.floor(clientHeight * RENDER_SCALE));
      renderer.setSize(w, h);
      Object.assign(gl.canvas.style, {
        width: "100%",
        height: "100%",
        display: "block",
      });
      program.uniforms.iResolution.value.r = w;
      program.uniforms.iResolution.value.g = h;
      program.uniforms.iResolution.value.b = w / h;
    }
    window.addEventListener("resize", resize);
    resize();

    const currentMouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];

    function handleMouseMove(e: MouseEvent) {
      const x = e.clientX / window.innerWidth;
      const y = 1.0 - (e.clientY / window.innerHeight);
      targetMouse = [x, y];
    }
    function handleMouseLeave() {
      targetMouse = [0.5, 0.5];
    }
    if (enableMouseInteraction) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseout", handleMouseLeave);
    }

    let visible = document.visibilityState !== "hidden";
    const onVis = () => {
      const nowVisible = document.visibilityState !== "hidden";
      if (nowVisible === visible) return;
      visible = nowVisible;
      if (!visible) {
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = 0;
        }
      } else if (!animationFrameId.current) {
        animationFrameId.current = requestAnimationFrame(update);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    function update(t: number) {
      if (!visible) {
        animationFrameId.current = 0;
        return;
      }
      if (enableMouseInteraction) {
        const smoothing = 0.02;
        currentMouse[0] += smoothing * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += smoothing * (targetMouse[1] - currentMouse[1]);
        program.uniforms.uMouse.value[0] = currentMouse[0];
        program.uniforms.uMouse.value[1] = currentMouse[1];
      } else {
        program.uniforms.uMouse.value[0] = 0.5;
        program.uniforms.uMouse.value[1] = 0.5;
      }
      program.uniforms.iTime.value = t * 0.001;

      renderer.render({ scene: mesh });
      animationFrameId.current = requestAnimationFrame(update);
    }
    animationFrameId.current = requestAnimationFrame(update);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener("resize", resize);

      if (enableMouseInteraction) {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseout", handleMouseLeave);
      }
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [color, amplitude, distance, enableMouseInteraction, staticBackdrop]);

  if (staticBackdrop) {
    return <StaticThreadsBackdrop className="w-full h-full relative" {...rest} />;
  }

  return <div ref={containerRef} className="w-full h-full relative" {...rest} />;
};

export default Threads;
