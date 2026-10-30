// The land: colours, light and shadow baked from the world (MapBaker), rivers drawn sharp at any zoom,
// and on top: every nation's land and borders, province lines (PoliticalMap), the deposits and the cell under the mouse.
Shader "DrawnBorders/Terrain"
{
    Properties
    {
        _ColorTex ("Colour (alpha: sunlight)", 2D) = "white" {}
        _DataTex ("Coast, river distance, river width, open sky", 2D) = "gray" {}
        _NormalTex ("Which way the ground faces", 2D) = "bump" {}
        _DetailTex ("Fine grain", 2D) = "gray" {}
        _PolIds ("The nation and province of each pixel", 2D) = "black" {}
        _PolDist ("Each pixel's distance to its nearest national and province border", 2D) = "white" {}
        _PolSize ("Pixels of those two pictures: w, h, 1/w, 1/h", Vector) = (768, 512, 0.0013, 0.00195)
        _DistRange ("Cells a distance of 1 stands for", Float) = 1.5
        _Palette ("Nation colours, province tints", 2D) = "black" {}
        _DepTex ("Deposits", 2D) = "black" {}
        _RiverColor ("River colour", Color) = (0.23, 0.5, 0.58, 1)
        _OwnerShown ("Show nations", Float) = 0
        _OwnerFill ("Fill strength", Float) = 0.22
        _ProvTint ("Tint the player's provinces", Float) = 0
        _ProvLines ("Show province lines", Float) = 0
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

            sampler2D _ColorTex, _DataTex, _NormalTex, _DetailTex, _PolIds, _PolDist, _Palette, _DepTex;
            float4 _RiverColor, _HoverCell, _PolSize;
            float _OwnerShown, _OwnerFill, _ProvTint, _ProvLines, _DistRange;

            float4 PaletteAt(float k, float row) { return tex2D(_Palette, float2((k + 0.5) / 256, row)); }

            // One layer of PoliticalMap from the four pixels around a point (ids, distances to their own land's border and
            // bilinear weights, in the order 00 10 01 11): measured from the nearest pixel's land, the distances on its side
            // count plus and the others minus, so their blend is the point's signed distance to the border. Gives the land on
            // this point's side, the land across that border, and how far the border is, in cells.
            void PolLayer(float4 ids, float4 dists, float4 w, float nearest, out float here, out float across, out float dist)
            {
                float4 same = 1 - step(0.5, abs(ids - nearest));
                float sd = dot(w, (same * 2 - 1) * dists);
                float other = nearest;
                if (same.w < 0.5) other = ids.w;
                if (same.z < 0.5) other = ids.z;
                if (same.y < 0.5) other = ids.y;
                if (same.x < 0.5) other = ids.x;
                here = sd >= 0 ? nearest : other;
                across = sd >= 0 ? other : nearest;
                dist = abs(sd) * _DistRange;
            }

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

                // nations: a light wash of each one's colour and clean border lines in smooth curves (PoliticalMap)
                float2 tp = uv * _PolSize.xy - 0.5;
                float2 b0 = floor(tp), fr = tp - b0;
                float2 u00 = (b0 + 0.5) * _PolSize.zw, ex = float2(_PolSize.z, 0), ey = float2(0, _PolSize.w);
                float4 I00 = floor(tex2D(_PolIds, u00) * 255 + 0.5), I10 = floor(tex2D(_PolIds, u00 + ex) * 255 + 0.5);
                float4 I01 = floor(tex2D(_PolIds, u00 + ey) * 255 + 0.5), I11 = floor(tex2D(_PolIds, u00 + ex + ey) * 255 + 0.5);
                float4 D00 = tex2D(_PolDist, u00), D10 = tex2D(_PolDist, u00 + ex), D01 = tex2D(_PolDist, u00 + ey), D11 = tex2D(_PolDist, u00 + ex + ey);
                float4 bw = float4((1 - fr.x) * (1 - fr.y), fr.x * (1 - fr.y), (1 - fr.x) * fr.y, fr.x * fr.y);
                float4 Inear = fr.y < 0.5 ? (fr.x < 0.5 ? I00 : I10) : (fr.x < 0.5 ? I01 : I11);
                float natK, natO, natD, provK, provO, provD;
                PolLayer(float4(I00.r, I10.r, I01.r, I11.r), float4(D00.r, D10.r, D01.r, D11.r), bw, Inear.r, natK, natO, natD);
                PolLayer(float4(I00.g, I10.g, I01.g, I11.g), float4(D00.g, D10.g, D01.g, D11.g), bw, Inear.g, provK, provO, provD);
                float4 natC = PaletteAt(natK, 0.25), othC = PaletteAt(natO, 0.25);
                float nDist = natD / px;                                     // screen pixels from a national border
                float nEdge = (1 - smoothstep(1.1, 2.2, nDist)) * max(natC.a, othC.a) * step(0.5, abs(natK - natO));
                float halo = (1 - smoothstep(2.0, 7.0, nDist)) * (1 - natC.a) * othC.a;
                float ownK = _OwnerShown * land;
                // provinces: the player's tinted while dividing, thin light lines inside every nation
                float4 provC = PaletteAt(provK, 0.75);
                float pDist = provD / px;
                float pEdge = (1 - smoothstep(0.5, 1.3, pDist)) * step(0.5, min(provK, provO)) * step(0.5, abs(provK - provO)) * smoothstep(3.0, 5.0, nDist) * natC.a;
                float3 fillC = lerp(natC.rgb, provC.rgb, _ProvTint * provC.a);
                float fillK = natC.a * lerp(_OwnerFill, 0.42, _ProvTint * provC.a);
                col = lerp(col, fillC * lightHere * 1.15, fillK * ownK);
                col *= 1 - halo * 0.3 * ownK;
                col = lerp(col, float3(0.96, 0.94, 0.88), pEdge * 0.7 * _ProvLines * ownK);
                col = lerp(col, natC.a > 0.5 ? natC.rgb : othC.rgb, nEdge * ownK);

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
