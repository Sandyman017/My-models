// What the game's engine sends back to Unity (Tools/js-engine/bridge.js), read with JsonUtility: -1 stands for "none".
using System;

namespace DrawnBorders.Game
{
    /// <summary>Everything the map draws: who owns each cell, each cell's province, the nations, provinces and towns.</summary>
    [Serializable]
    public sealed class GameState
    {
        public int turn;
        public int[] owner;       // nation id for every cell, -1 for wild land and sea
        public int[] prov;        // province id for every cell, -1 for none
        public NationInfo[] nations;
        public ProvinceInfo[] provinces;
        public TownInfo[] towns;
    }

    [Serializable] public sealed class NationInfo { public int id; public string name; public string color; public bool alive, minor, player; }
    [Serializable] public sealed class ProvinceInfo { public int id, owner; public string name; public int capital; public string tint; }
    [Serializable] public sealed class TownInfo { public int id, cell; public string name; public int owner; public bool capital, provCapital; public float pop; }

    /// <summary>The player's provinces, as the founding's second step lists them.</summary>
    [Serializable] public sealed class ProvinceRows { public ProvinceRow[] rows; }
    [Serializable] public sealed class ProvinceRow { public int id; public string name, tint, area, people; public int capital; public RowTown[] towns; }
    [Serializable] public sealed class RowTown { public int id; public string name; public bool natCapital; }

    [Serializable] public sealed class Reply { public bool ok; public string reason; }

    /// <summary>The land inside a line drawn with the province pen.</summary>
    [Serializable]
    public sealed class PenReply
    {
        public bool ok, canNew;
        public string reason, area, people, minArea;
        public int[] cells;
        public string[] towns;
        public PenTarget[] targets;
    }
    [Serializable] public sealed class PenTarget { public int id; public string name; }

    [Serializable] public sealed class StartReply { public string[] lines; }

    /// <summary>The bar at the top: the nation, the date, the figures with their notes.</summary>
    [Serializable] public sealed class HudInfo { public string name, color, season, era; public HudStat[] stats; }
    [Serializable] public sealed class HudStat { public string key, value, note, tone; }

    /// <summary>A season played: its news (five at most), the full report, why time stopped by itself, a fallen government.</summary>
    [Serializable] public sealed class SeasonResult { public string season, pause; public NewsItem[] news, report; public bool collapsed; }
    /// <summary>go: what clicking it opens ("decision" with its id, else the report for now).</summary>
    [Serializable] public sealed class NewsItem { public int pri, id; public string text, tone, go; }

    [Serializable] public sealed class DecisionList { public DecisionInfo[] list; }
    [Serializable] public sealed class DecisionInfo { public int id, cell; public string title, body, tone, cat, place, by, def; public DecisionOption[] options; }
    [Serializable] public sealed class DecisionOption { public string id, label, sub; public Chip[] chips; }
    [Serializable] public sealed class Chip { public string text, tone; }
    [Serializable] public sealed class DecideReply { public bool ok; public string reason, text; }
}
