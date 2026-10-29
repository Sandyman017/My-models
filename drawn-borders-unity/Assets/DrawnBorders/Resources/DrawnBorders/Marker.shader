// Little houses of the towns: plain colour, lit by the same sun as the land.
Shader "DrawnBorders/Marker"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "DrawnBorders.cginc"

            float4 _Color;

            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; };
            struct v2f { float4 pos : SV_POSITION; float3 wpos : TEXCOORD0; float3 wnormal : TEXCOORD1; };

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.wpos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.wnormal = UnityObjectToWorldNormal(v.normal);
                return o;
            }

            float4 frag (v2f i) : SV_Target
            {
                float3 n = normalize(i.wnormal);
                float3 col = _Color.rgb * DBLight(n, 1, 1);
                return float4(DBFog(col, i.wpos), 1);
            }
            ENDCG
        }
    }
    Fallback Off
}
