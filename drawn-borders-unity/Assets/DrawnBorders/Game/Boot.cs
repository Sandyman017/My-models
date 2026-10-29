// Starts the game in whatever scene is open when you press Play, so the project needs no scene set up by hand.
using UnityEngine;

namespace DrawnBorders.Game
{
    static class Boot
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Start()
        {
            if (FoundingGame.Instance != null) return;
            new GameObject("Drawn Borders").AddComponent<FoundingGame>();
        }
    }
}
