// The sea: coloured by its depth (the web map's water colours), clear in the shallows so the sea floor shows,
// ripples moving with the wind, the sun glinting off them and surf along the shore.
Shader "DrawnBorders/Water"
{
    Properties
    {
        _DataTex ("Coast (red channel)", 2D) = "gray" {}
        _DetailTex ("Ripples", 2D) = "gray" {}
        _WaterGrad ("Colour by depth", 2D) = "blue" {}
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "IgnoreProjector"="True" }
        Pass
        {
            ZWrite Off
            Blend SrcAlpha OneMinusSrcAlpha
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            #include "DrawnBorders.cginc"

            sampler2D _DataTex, _DetailTex, _WaterGrad;

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
                float2 uv = i.wpos.xz / _MapSize.xy;
                float4 dd = tex2D(_DataTex, uv);
                float depth = max(0, (0.5 - dd.r) / 1.25);                  // below sea level, in the world's elevation units
                float2 outside = max(max(-uv, uv - 1), 0) * _MapSize.xy;    // cells beyond the map: the open ocean
                depth = max(depth, saturate(length(outside) / 12) * 0.35);
                float fw = max(fwidth(dd.r), 0.0001);
                float wet = 1 - smoothstep(0.5 - fw, 0.5 + fw, dd.r);
                if (length(outside) > 0) wet = 1;
                clip(wet - 0.002);

                float t = _Clock;
                float2 p = i.wpos.xz;
                float2 w1 = tex2D(_DetailTex, p * 0.21 + float2(t * 0.011, t * 0.007)).rg;
                float2 w2 = tex2D(_DetailTex, p * 0.53 - float2(t * 0.009, -t * 0.013)).ba;
                float2 slope = (w1 - 0.5) * 0.5 + (w2 - 0.5) * 0.35;
                float3 n = normalize(float3(slope.x, 1, slope.y));
                float3 toEye = normalize(_WorldSpaceCameraPos - i.wpos);
                float3 sun = normalize(_SunDir.xyz);
                float3 hv = normalize(sun + toEye);
                float nh = saturate(dot(n, hv));
                float spec = pow(nh, 220) * 2.0 + pow(nh, 28) * 0.1;
                float fres = pow(1 - saturate(dot(n, toEye)), 4);

                float3 baseCol = tex2D(_WaterGrad, float2(saturate(depth / 0.35), 0.5)).rgb;
                float3 col = baseCol * DBLight(n, 1, 1);
                col = lerp(col, _FogColor.rgb, fres * 0.5) + spec * _SunLight.rgb;

                // the shallows are clear
                float clearK = exp(-depth * 38);
                float alpha = lerp(0.95, 0.15, clearK);

                // surf along the shore
                float foamN = tex2D(_DetailTex, p * 1.7 + t * 0.02).r;
                float foam = (1 - smoothstep(0.0, 0.006, depth)) * smoothstep(0.35, 0.65, foamN + 0.25 * sin(t * 1.3 + depth * 900));
                col = lerp(col, float3(0.9, 0.93, 0.93) * DBLight(float3(0, 1, 0), 1, 1), foam * 0.6);
                alpha = max(alpha, foam * 0.7) * wet;

                return float4(DBFog(col, i.wpos), alpha);
            }
            ENDCG
        }
    }
    Fallback Off
}
