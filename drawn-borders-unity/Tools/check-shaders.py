#!/usr/bin/env python3
"""Checks the map's shaders for mistakes without Unity: takes each CGPROGRAM block, puts a small stand-in for
Unity's include file in front, and compiles the vertex and fragment programs with glslangValidator (HLSL).
python3 Tools/check-shaders.py   (run from drawn-borders-unity/; needs glslang-tools)"""
import os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SHADERS = os.path.join(HERE, "..", "Assets", "DrawnBorders", "Resources", "DrawnBorders")
UNITY_STUB = """
float4x4 unity_ObjectToWorld; float4x4 unity_MatrixVP; float3 _WorldSpaceCameraPos;
float4 UnityObjectToClipPos(float4 v) { return mul(unity_MatrixVP, mul(unity_ObjectToWorld, v)); }
float3 UnityObjectToWorldNormal(float3 n) { return normalize(mul((float3x3)unity_ObjectToWorld, n)); }
"""

def expand(src, folder):
    def inc(m):
        name = m.group(1)
        if name == "UnityCG.cginc": return UNITY_STUB
        with open(os.path.join(folder, name)) as f: return expand(f.read(), folder)
    return re.sub(r'#include\s+"([^"]+)"', inc, src)

failed = 0
for fn in sorted(os.listdir(SHADERS)):
    if not fn.endswith(".shader"): continue
    text = open(os.path.join(SHADERS, fn)).read()
    for k, block in enumerate(re.findall(r"CGPROGRAM(.*?)ENDCG", text, re.S)):
        code = "\n".join(l for l in expand(block, SHADERS).splitlines() if not l.strip().startswith("#pragma"))
        for stage, entry in (("vert", "vert"), ("frag", "frag")):
            with tempfile.NamedTemporaryFile("w", suffix=".hlsl", delete=False) as t: t.write(code)
            r = subprocess.run(["glslangValidator", "-D", "-V", "-S", stage, "-e", entry, t.name, "-o", os.devnull], capture_output=True, text=True)
            os.unlink(t.name)
            ok = r.returncode == 0
            print(f"{fn} pass {k} {stage}: {'ok' if ok else 'FAILED'}")
            if not ok: failed += 1; print(r.stdout + r.stderr)
sys.exit(1 if failed else 0)
