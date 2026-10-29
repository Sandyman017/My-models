// The border as you draw it: always on top of the land, soft at its edges.
Shader "DrawnBorders/Line"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Overlay" "IgnoreProjector"="True" }
        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float4 _Color;

            struct appdata { float4 vertex : POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color * _Color;
                o.uv = v.uv;
                return o;
            }

            float4 frag (v2f i) : SV_Target
            {
                float a = 1 - smoothstep(0.32, 0.5, abs(i.uv.y - 0.5));
                return float4(i.color.rgb, i.color.a * a);
            }
            ENDCG
        }
    }
    Fallback Off
}
