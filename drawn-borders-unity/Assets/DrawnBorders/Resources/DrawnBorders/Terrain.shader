// The land: colours, light and shadow baked from the world (MapBaker), rivers drawn sharp at any zoom,
// and on top what the founding step shows: your borders, the deposits and the cell under the mouse.
Shader "DrawnBorders/Terrain"
{
    Properties
    {
        _ColorTex ("Colour (alpha: sunlight)", 2D) = "white" {}
        _DataTex ("Coast, river distance, river width, open sky", 2D) = "gray" {}
        _NormalTex ("Which way the ground faces", 2D) = "bump" {}
        _DetailTex ("Fine grain", 2D) = "gray" {}
        _OwnerTex ("Your land", 2D) = "black" {}
        _DepTex ("Deposits", 2D) = "black" {}
        _NationColor ("Nation colour", Color) = (0.83, 0.31, 0.24, 1)
        _RiverColor ("River colour", Color) = (0.23, 0.5, 0.58, 1)
        _OwnerShown ("Show your land", Float) = 0
        _OwnerFill ("Fill strength", Float) = 0.22
        _HoverCell ("Cell under the mouse", Vector) = (-10, -10, 0, 0)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            #include "DrawnBorders.cginc"

            sampler2D _ColorTex, _DataTex, _NormalTex, _DetailTex, _OwnerTex, _DepTex;
            float4 _NationColor, _RiverColor, _HoverCell;
            float _OwnerShown, _OwnerFill;

            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 pos : SV_POSITION; float3 wpos : TEXCOORD0; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.wpos = mul(unity_ObjectToWorld, v.vertex).xyz;
                return o;
            }

            float4 frag (v2f i) : SV_Target
            {
                float2 cellXY = float2(i.wpos.x, _MapSize.y - i.wpos.z);   // in cells, y down as in the rules
                float2 uv = i.wpos.xz / _MapSize.xy;
                float4 c = tex2D(_ColorTex, uv);
                float4 d = tex2D(_DataTex, uv);
                float3 n = normalize(tex2D(_NormalTex, uv).xyz * 2 - 1);
                float px = max(length(fwidth(cellXY)), 0.0001);           // cells per screen pixel
                float landFw = max(fwidth(d.r), 0.0001);
                float land = smoothstep(0.5 - landFw, 0.5 + landFw, d.r);

                // fine grain on the ground, more of it close up
                float g1 = tex2D(_DetailTex, cellXY * 0.37).r;
                float g2 = tex2D(_DetailTex, cellXY * 2.3).g;
                float fineK = saturate(1.5 - px * 8);
                float3 albedo = c.rgb * (1 + (g1 - 0.5) * 0.16 + (g2 - 0.5) * 0.14 * fineK);
                float3 lightHere = DBLight(n, c.a, d.a);
                float3 col = albedo * lightHere;

                // rivers, from the distance to their middle line, so they stay sharp however close you are
                float rw = d.b * 0.1;
                if (rw > 0.001)
                {
                    float rd = d.g * 0.3;
                    float hw = max(rw, px * 0.55);
                    float river = 1 - smoothstep(hw - px * 0.6, hw + px * 0.6, rd);
                    river *= saturate(rw * 2 / px * 1.6) * land;
                    float3 up = float3(0, 1, 0);
                    float3 toEye = normalize(_WorldSpaceCameraPos - i.wpos);
                    float3 hv = normalize(normalize(_SunDir.xyz) + toEye);
                    float spec = pow(saturate(dot(up, hv)), 80) * 0.6 * c.a;
                    float3 rc = _RiverColor.rgb * DBLight(up, c.a, 1) + spec * _SunLight.rgb;
                    col = lerp(col, rc, river);
                }

                // deposits: a coloured patch in the middle of the cell
                float2 cell = floor(cellXY);
                float2 f = cellXY - cell - 0.5;
                float4 dep = tex2D(_DepTex, float2((cell.x + 0.5) / _MapSize.x, 1 - (cell.y + 0.5) / _MapSize.y));
                float wob = (tex2D(_DetailTex, cellXY * 0.9).b - 0.5) * 0.08;
                float depR = length(f) + wob;
                float depAa = px * 0.8;
                float blob = (1 - smoothstep(0.27 - depAa, 0.27 + depAa, depR)) * step(0.5, dep.a) * land;
                float rim = blob * smoothstep(0.2 - depAa, 0.2 + depAa, depR);
                col = lerp(col, dep.rgb * lightHere * 1.25, blob * 0.8);
                col *= 1 - rim * 0.35;

                // your land: a light wash of your colour and a clean border line in smooth curves
                float own = tex2D(_OwnerTex, uv).r;
                float ow = max(fwidth(own), 0.0001);
                float inside = smoothstep(0.5 - ow, 0.5 + ow, own);
                float distPx = abs(own - 0.5) / ow;                          // pixels from the border
                float edge = 1 - smoothstep(1.1, 2.2, distPx);
                float halo = (1 - smoothstep(2.0, 7.0, distPx)) * (1 - inside);
                float ownK = _OwnerShown * land;
                col = lerp(col, _NationColor.rgb * lightHere * 1.15, inside * _OwnerFill * ownK);
                col *= 1 - halo * 0.3 * ownK;
                col = lerp(col, _NationColor.rgb, edge * ownK);

                // the cell under the mouse
                if (_HoverCell.z > 0.5 && abs(cell.x - _HoverCell.x) < 0.5 && abs(cell.y - _HoverCell.y) < 0.5)
                {
                    float2 e2 = 0.5 - abs(f);
                    float m = min(e2.x, e2.y);
                    float hl = 1 - smoothstep(px * 1.0, px * 2.2, m);
                    col = lerp(col * 1.06, float3(1, 1, 1), hl * 0.6 * land);
                }

                return float4(DBFog(col, i.wpos), 1);
            }
            ENDCG
        }
    }
    Fallback Off
}
