// Shared by the map's shaders: the sun, the sky and the haze. The light is worked out as the web map does it
// (in display colours); in a project set to Linear colour space it is converted so the map looks the same.
#ifndef DRAWN_BORDERS_INCLUDED
#define DRAWN_BORDERS_INCLUDED

float4 _SunDir, _SunLight, _SkyLight, _GroundLight, _FogColor, _MapSize;
float _LinearSpace, _FogNear, _FogFar, _Clock;

float3 DBLight(float3 n, float sunlit, float sky)
{
    float ndl = saturate(dot(n, normalize(_SunDir.xyz)));
    float3 amb = lerp(_GroundLight.rgb, _SkyLight.rgb, n.y * 0.5 + 0.5) * sky;
    float3 l = amb + _SunLight.rgb * ndl * sunlit;
    return _LinearSpace > 0.5 ? pow(max(l, 0.0001), 2.2) : l;
}

float3 DBFog(float3 col, float3 wpos)
{
    float fd = distance(_WorldSpaceCameraPos, wpos);
    float fog = saturate((fd - _FogNear) / max(_FogFar - _FogNear, 1.0));
    return lerp(col, _FogColor.rgb, fog);
}

#endif
