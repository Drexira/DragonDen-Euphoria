using SPTarkov.Server.Core.Models.Utils;

namespace DragonDen_Euphoria.Utils;

public static class Logging
{
    static string prefix = "[DragonDen-Euphoria] ";
    public static void Log(ISptLogger<Euphoria> log, string message)
    {
        log.LogWithColor(prefix + message, SPTarkov.Server.Core.Models.Logging.LogTextColor.Magenta);
    }

    public static void Warning(ISptLogger<Euphoria> log, string message)
    {
        log.Warning(prefix + message);
    }

    public static void Info(ISptLogger<Euphoria> log, string message)
    {
        log.Info(prefix + message);
    }

    public static void Error(ISptLogger<Euphoria> log, string message)
    {
        log.Error(prefix + message);
    }

    public static void Success(ISptLogger<Euphoria> log, string message)
    {
        log.Success(prefix + message);
    }
}
