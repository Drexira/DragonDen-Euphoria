using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Helpers;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Spt.Config;
using SPTarkov.Server.Core.Models.Spt.Mod;
using SPTarkov.Server.Core.Routers;
using SPTarkov.Server.Core.Servers;
using SPTarkov.Server.Core.Utils;
using System.Reflection;
using Microsoft.Extensions.Logging;
using SPTarkov.Server.Core.Models.Common;
using SPTarkov.Server.Core.Services;
using WTTServerCommonLib.Models;
using Path = System.IO.Path;

namespace DragonDen_Euphoria;
public record ModMetadata : AbstractModMetadata
{
    public override string ModGuid { get; init; } = "net.drexira.euphoria";
    public override string Name { get; init; } = "DragonDen-Euphoria";
    public override string Author { get; init; } = "Drexira";
    public override List<string>? Contributors { get; init; } = [];
    public override SemanticVersioning.Version Version { get; init; } = new("2.0.1");
    public override SemanticVersioning.Range SptVersion { get; init; } = new("~4.0");
    
    public override List<string>? Incompatibilities { get; init; } = [];
    public override Dictionary<string, SemanticVersioning.Range>? ModDependencies { get; init; } = new()
    {
        { "com.wtt.commonlib", new SemanticVersioning.Range("~2.0") }
    };
    public override string? Url { get; init; } = "https://forge.sp-tarkov.com/mod/2330/dragon-den-euphoria";
    public override bool? IsBundleMod { get; init; } = true;
    public override string? License { get; init; } = "MIT";
}

[Injectable(TypePriority = OnLoadOrder.PostDBModLoader + 2)]
public class Euphoria(WTTServerCommonLib.WTTServerCommonLib wtt, DatabaseService db, ConfigServer config, 
    ModHelper helper, AddCustomTraderHelper addCustomTraderHelper, ImageRouter imageRouter, TimeUtil timeUtil) : IOnLoad
{
    private readonly TraderConfig _traderConfig = config.GetConfig<TraderConfig>();
    private readonly RagfairConfig _ragfairConfig = config.GetConfig<RagfairConfig>();
    
    public async Task OnLoad()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var pathToMod = helper.GetAbsolutePathToModFolder(Assembly.GetExecutingAssembly());
        var traderImagePath = Path.Combine(pathToMod, "db/res/Euphoria.png");
        var traderBase = helper.GetJsonDataFromFile<TraderBase>(pathToMod, "db/base.json");
        
        string itemConfigsDirectory = Path.Combine("db", "Items");
        string hideoutRecipesDirectory = Path.Combine("db", "HideoutRecipes");
        string questsDirectory = Path.Combine("db", "Quests");
        string questZonesDirectory = Path.Combine("db", "QuestZones");
        //string lootSpawnDirectory = Path.Combine("db", "LootSpawns");
        string lootSpawnQuestsDirectory = Path.Combine("db", "LootSpawnsQuests");
        
        imageRouter.AddRoute(traderBase?.Avatar.Replace(".png", ""), traderImagePath);
        addCustomTraderHelper.SetTraderUpdateTime(_traderConfig, traderBase, timeUtil.GetHoursAsSeconds(1), timeUtil.GetHoursAsSeconds(2));
        _ragfairConfig.Traders.TryAdd(traderBase.Id, true);
        addCustomTraderHelper.AddTraderWithEmptyAssortToDb(traderBase);
        addCustomTraderHelper.AddTraderToLocales(traderBase, "Euphoria", "Has a tidy shack called the Dragon Den. Reliable equipment, fair barters, and a little cute on the side.");
        var assort = helper.GetJsonDataFromFile<TraderAssort>(pathToMod, "db/assort.json");
        addCustomTraderHelper.OverwriteTraderAssort(traderBase.Id, assort);
        
        // Registering the actual custom stuff
        TraderIds.Add("euphoria", "68b96623ca01bc95211d3de9");
        await wtt.CustomItemServiceExtended.CreateCustomItems(assembly, itemConfigsDirectory);
        await wtt.CustomHideoutRecipeService.CreateHideoutRecipes(assembly, hideoutRecipesDirectory);
        await wtt.CustomQuestService.CreateCustomQuests(assembly, questsDirectory);
        await wtt.CustomQuestZoneService.CreateCustomQuestZones(assembly, questZonesDirectory);
        //await wtt.CustomLootspawnService.CreateCustomLootSpawns(assembly, lootSpawnDirectory);
        await wtt.CustomLootspawnService.CreateCustomLootSpawns(assembly, lootSpawnQuestsDirectory);
        
        await Task.CompletedTask;
    }
}