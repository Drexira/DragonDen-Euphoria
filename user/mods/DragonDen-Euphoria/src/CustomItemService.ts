/* eslint-disable @typescript-eslint/naming-convention */
import { NewItemFromCloneDetails } from "@spt/models/spt/mod/NewItemDetails";
import {
    Preset,
    Item,
    ConfigItem,
    traderIDs,
    currencyIDs,
    allBotTypes,
    inventorySlots
} from "./references/configConsts";
import { ItemMap } from "./references/items";
import { ItemBaseClassMap } from "./references/itemBaseClasses";
import { ItemHandbookCategoryMap } from "./references/itemHandbookCategories";
import { LogTextColor } from "@spt/models/spt/logging/LogTextColor";
import * as fs from "fs";
import * as path from "path";
import { WTTInstanceManager } from "./WTTInstanceManager";
import { QuestModifier } from "./QuestModifier";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { ILocation, ItemDistribution } from "@spt/models/eft/common/ILocation";
import { IPreset } from "@spt/models/eft/common/IGlobals";
import { ILooseLoot, ISpawnpoint, ISpawnpointsForced } from "@spt/models/eft/common/ILooseLoot";
import { Ixyz } from "@spt/models/eft/common/Ixyz";
import * as modConfig from "../config/mod_config.json";
import { IItem } from "@spt/models/eft/common/tables/IItem";

export class CustomItemService {
    private configs: ConfigItem;
    private Instance: WTTInstanceManager;
    private questModifier: QuestModifier;

    constructor() {
        this.configs = this.loadCombinedConfig();
        this.questModifier = new QuestModifier();
    }

    public preSptLoad(Instance: WTTInstanceManager): void {
        this.Instance = Instance;
    }

    public postDBLoad(): void {
        let numItemsAdded = 0;

        for (const itemId in this.configs) {
            const itemConfig = this.configs[itemId];

            const { exampleCloneItem, finalItemTplToClone } =
                this.createExampleCloneItem(itemConfig, itemId);
            if (this.Instance.debug) {
                console.log(`Item ID: ${itemId}`);
                console.log(`Prefab Path: ${exampleCloneItem.overrideProperties?.Prefab.path}`);
            }
            this.Instance.customItem.createItemFromClone(exampleCloneItem);

            this.processStaticLootContainers(itemConfig, itemId);
            this.processModSlots(itemConfig, [finalItemTplToClone], itemId); // Wrap finalItemTplToClone in an array
            this.processInventorySlots(itemConfig, itemId); // Pass itemId and inventorySlots in the correct order
            this.processMasterySections(itemConfig, itemId);
            this.processWeaponPresets(itemConfig, itemId);
            this.processTraders(itemConfig, itemId);
            this.addtoSpecialSlots(itemConfig, itemId);
            this.addtoHallofFame(itemConfig, itemId);
            this.addToPosterSlots(itemConfig, itemId);
            this.addToStatuetteSlots(itemConfig, itemId);
            this.addPosterToMaps(itemConfig, itemId);
            this.addItemToLootLocations(itemConfig, itemId);
            this.addtoGenerator(itemConfig, itemId);
            this.addQuestItemsToMaps(itemConfig, itemId);
            this.addCustomSlotPatch(itemConfig, itemId);
            numItemsAdded++;
        }

        if (numItemsAdded > 0) {
            this.Instance.logger.log(
                `[${this.Instance.modName}] Database: Loaded ${numItemsAdded} custom items.`,
                LogTextColor.MAGENTA
            );
        }
        else {
            this.Instance.logger.log(
                `[${this.Instance.modName}] Database: No custom items loaded.`,
                LogTextColor.MAGENTA
            );
        }

        for (const itemId in this.configs) {
            const itemConfig = this.configs[itemId];

            this.processBotInventories(itemConfig, itemConfig.itemTplToClone, itemId);

        }

        this.questModifier.modifyQuests(this.Instance.database, this.Instance.jsonUtil, this.Instance.debug);
    }



    /**
   * Creates an example clone item with the provided item configuration and item ID.
   *
   * @param {any} itemConfig - The configuration of the item to clone.
   * @param {string} itemId - The ID of the item.
   * @return {{ exampleCloneItem: NewItemFromCloneDetails, finalItemTplToClone: string }} The created example clone item and the final item template to clone.
   */
    private createExampleCloneItem(
        itemConfig: ConfigItem[string],
        itemId: string
    ): {
        exampleCloneItem: NewItemFromCloneDetails;
        finalItemTplToClone: string;
    } {
        const itemTplToCloneFromMap =
            ItemMap[itemConfig.itemTplToClone] || itemConfig.itemTplToClone;
        const finalItemTplToClone = itemTplToCloneFromMap;

        const parentIdFromMap =
            ItemBaseClassMap[itemConfig.parentId] || itemConfig.parentId;
        const finalParentId = parentIdFromMap;

        const handbookParentIdFromMap =
            ItemHandbookCategoryMap[itemConfig.handbookParentId] ||
            itemConfig.handbookParentId;
        const finalHandbookParentId = handbookParentIdFromMap;

        const itemPrefabPath = `customItems/${itemId}.bundle`;

        const exampleCloneItem: NewItemFromCloneDetails = {
            itemTplToClone: finalItemTplToClone,
            overrideProperties: itemConfig.overrideProperties
                ? {
                    ...itemConfig.overrideProperties,
                    Prefab: {
                        path:
                            itemConfig.overrideProperties.Prefab?.path || itemPrefabPath,
                        rcid: ""
                    }
                }
                : undefined,
            parentId: finalParentId,
            newId: itemId,
            fleaPriceRoubles: itemConfig.fleaPriceRoubles,
            handbookPriceRoubles: itemConfig.handbookPriceRoubles,
            handbookParentId: finalHandbookParentId,
            locales: itemConfig.locales
        };
        if (this.Instance.debug) {
            console.log(`Cloning item ${finalItemTplToClone} for itemID: ${itemId}`);
        }
        return { exampleCloneItem, finalItemTplToClone };
    }

    /**
     * Adds an item to a static loot container with a given probability.
     *
     * @param {string} containerID - The ID of the loot container.
     * @param {string} itemToAdd - The item to add to the loot container.
     * @param {number} probability - The probability of the item being added.
     * @return {void} This function does not return anything.
     */
    private addToStaticLoot(
        containerID: string,
        itemToAdd: string,
        probability: number
    ): void {
        const locations = this.Instance.database.locations;

        for (const locationID in locations) {
            if (locations.hasOwnProperty(locationID)) {
                const location: ILocation = locations[locationID];

                if (location.staticLoot) {
                    const staticLoot = location.staticLoot;

                    if (staticLoot.hasOwnProperty(containerID)) {
                        const lootContainer = staticLoot[containerID];

                        if (lootContainer) {
                            const lootDistribution = lootContainer.itemDistribution;
                            const templateFromMap = ItemMap[itemToAdd];
                            const finalTemplate = templateFromMap || itemToAdd;

                            const newLoot = [
                                {
                                    tpl: finalTemplate,
                                    relativeProbability: probability
                                }
                            ];

                            lootDistribution.push(...newLoot);
                            lootContainer.itemDistribution = lootDistribution;
                            if (this.Instance.debug) { 
                                console.log(`Added ${itemToAdd} to loot container: ${containerID} in location: ${locationID}`);
                            }
                        } else {
                            if (this.Instance.debug) {
                                console.log(`Error: Loot container ID ${containerID} not found in location: ${locationID}`);
                            }
                        }
                    } else {
                        if (this.Instance.debug) {
                            console.log(`Error: Loot container ID ${containerID} not found in location: ${locationID}`);
                        }
                    }
                } else {
                    if (this.Instance.debug) {
                        console.warn(`Warning: No static loot found in location: ${locationID}`);
                    }
                }
            }
        }
    }

    /**
   * Processes the static loot containers for a given item.
   *
   * @param {any} itemConfig - The configuration object for the item.
   * @param {string} itemId - The ID of the item.
   * @return {void} This function does not return a value.
   */
    private processStaticLootContainers(itemConfig: any, itemId: string): void {
        if (itemConfig.addtoStaticLootContainers) {
            if (this.Instance.debug) {
                console.log("Processing static loot containers for item:", itemId);
            }
            if (Array.isArray(itemConfig.StaticLootContainers)) {
                if (this.Instance.debug) {
                    console.log("Adding item to multiple static loot containers:");
                }
                itemConfig.StaticLootContainers.forEach((container) => {
                    const staticLootContainer =
                        ItemMap[container.ContainerName] || container.ContainerName;
                    this.addToStaticLoot(
                        staticLootContainer,
                        itemId,
                        container.Probability
                    );
                    if (this.Instance.debug) {
                        console.log(` - Added to container '${staticLootContainer}' with probability ${container.Probability}`);
                    }
                });
            }
            else {
                const staticLootContainer =
                    ItemMap[itemConfig.StaticLootContainers] ||
                    itemConfig.StaticLootContainers;
                this.addToStaticLoot(
                    staticLootContainer,
                    itemId,
                    itemConfig.Probability
                );
                if (this.Instance.debug) {
                    console.log(`Added to container '${staticLootContainer}' with probability ${itemConfig.Probability}`);
                }
            }
        }
    }

    /**
   * Processes the mod slots of an item.
   *
   * @param {any} itemConfig - The configuration of the item.
   * @param {string[]} finalItemTplToClone - The final item template to clone.
   * @param {string} itemId - The ID of the item.
   * @returns {void}
   */
    private processModSlots(
        itemConfig: ConfigItem[string],
        finalItemTplToClone: string[],
        itemId: string
    ): void {
        const tables = this.Instance.database;

        const moddableItemWhitelistIds = Array.isArray(
            itemConfig.ModdableItemWhitelist
        )
            ? itemConfig.ModdableItemWhitelist.map((shortname) => ItemMap[shortname])
            : itemConfig.ModdableItemWhitelist
                ? [ItemMap[itemConfig.ModdableItemWhitelist]]
                : [];

        const moddableItemBlacklistIds = Array.isArray(
            itemConfig.ModdableItemBlacklist
        )
            ? itemConfig.ModdableItemBlacklist.map((shortname) => ItemMap[shortname])
            : itemConfig.ModdableItemBlacklist
                ? [ItemMap[itemConfig.ModdableItemBlacklist]]
                : [];

        const modSlots = Array.isArray(itemConfig.modSlot)
            ? itemConfig.modSlot
            : itemConfig.modSlot
                ? [itemConfig.modSlot]
                : [];

        const lowercaseModSlots = modSlots.map((modSlotName) =>
            modSlotName.toLowerCase()
        );

        if (itemConfig.addtoModSlots) {
            if (this.Instance.debug) {
                console.log("Processing mod slots for item:", itemId);
            }
            for (const parentItemId in tables.templates.items) {
                const parentItem = tables.templates.items[parentItemId];

                if (!parentItem._props.Slots) {
                    continue;
                }

                const isBlacklisted = moddableItemBlacklistIds.includes(parentItemId);
                const isWhitelisted = moddableItemWhitelistIds.includes(parentItemId);

                if (isBlacklisted) {
                    continue;
                }

                let addToModSlots = false;

                if (isWhitelisted && itemConfig.modSlot) {
                    addToModSlots = true;
                }
                else if (!isBlacklisted && itemConfig.modSlot) {
                    for (const modSlot of parentItem._props.Slots) {
                        if (
                            modSlot._props.filters &&
                            modSlot._props.filters[0].Filter.some((filterItem) =>
                                finalItemTplToClone.includes(filterItem)
                            )
                        ) {
                            if (lowercaseModSlots.includes(modSlot._name.toLowerCase())) {
                                addToModSlots = true;
                                break;
                            }
                        }
                    }
                }

                if (addToModSlots) {
                    for (const modSlot of parentItem._props.Slots) {
                        if (lowercaseModSlots.includes(modSlot._name.toLowerCase())) {
                            if (!modSlot._props.filters) {
                                modSlot._props.filters = [
                                    {
                                        AnimationIndex: 0,
                                        Filter: []
                                    }
                                ];
                            }
                            if (!modSlot._props.filters[0].Filter.includes(itemId)) {
                                modSlot._props.filters[0].Filter.push(itemId);
                                if (this.Instance.debug) {
                                    console.log(`Successfully added item ${itemId} to the filter of mod slot ${modSlot._name} for parent item ${parentItemId}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /**
   * Processes the inventory slots for a given item.
   *
   * @param {any} itemConfig - The configuration object for the item.
   * @param {string} itemId - The ID of the item.
   * @param {any} defaultInventorySlots - The default inventory slots.
   * @return {void} This function does not return a value.
   */
    private processInventorySlots(
        itemConfig: ConfigItem[string],
        itemId: string
    ): void {
        const tables = this.Instance.database;

        if (itemConfig.addtoInventorySlots) {
            if (this.Instance.debug) {
                console.log("Processing inventory slots for item:", itemId);
            }
            const defaultInventorySlots =
                tables.templates.items["55d7217a4bdc2d86028b456d"]._props.Slots;

            const allowedSlots = Array.isArray(itemConfig.addtoInventorySlots)
                ? itemConfig.addtoInventorySlots
                : [itemConfig.addtoInventorySlots];

            // Iterate over the slots and push the item into the filters per the config
            for (const slot of defaultInventorySlots) {
                const slotName = inventorySlots[slot._name];
                const slotId = Object.keys(inventorySlots).find(
                    (key) => inventorySlots[key] === slot._name
                );

                if (
                    allowedSlots.includes(slot._name) ||
                    allowedSlots.includes(slotName) ||
                    allowedSlots.includes(slotId)
                ) {
                    if (!slot._props.filters[0].Filter.includes(itemId)) {
                        slot._props.filters[0].Filter.push(itemId);
                        if (this.Instance.debug) {
                            console.log(`Successfully added item ${itemId} to the filter of slot ${slot._name}`);
                        }
                    }
                }
            }
        }
    }

    /**
   * Processes the mastery sections for an item.
   *
   * @param {any} itemConfig - The configuration object for the item.
   * @param {string} itemId - The ID of the item.
   * @param {any} tables - The tables object containing global configuration.
   * @return {void} This function does not return a value.
   */
    private processMasterySections(
        itemConfig: ConfigItem[string],
        itemId: string
    ): void {
        const tables = this.Instance.database;
        if (itemConfig.masteries) {
            if (this.Instance.debug) {
                console.log("Processing mastery sections for item:", itemId);
            }
            const masterySections = Array.isArray(itemConfig.masterySections)
                ? itemConfig.masterySections
                : [itemConfig.masterySections];

            for (const mastery of masterySections) {
                const existingMastery = tables.globals.config.Mastering.find(
                    (existing) => existing.Name === mastery.Name
                );
                if (existingMastery) {
                    existingMastery.Templates.push(...mastery.Templates);
                    if (this.Instance.debug) {
                        console.log(` - Adding to existing mastery section for item: ${itemId}`);
                    }
                }
                else {
                    tables.globals.config.Mastering.push(mastery);
                    if (this.Instance.debug) {
                        console.log(` - Adding new mastery section for item: ${itemId}`);
                    }
                }
            }
        }
    }

    /**
   * Processes weapon presets based on the provided item configuration and tables.
   *
   * @param {any} itemConfig - The item configuration.
   * @return {void} This function does not return anything.
   */
    private processWeaponPresets(
        itemConfig: ConfigItem[string],
        itemId: string
    ): void {
        const tables = this.Instance.database;
        const { addweaponpreset, weaponpresets } = itemConfig;
        const itemPresets = tables.globals.ItemPresets;

        if (addweaponpreset) {
            if (this.Instance.debug) {
                console.log("Processing weapon presets for item:", itemId);
            }
            weaponpresets.forEach((presetData) => {
                const preset: Preset = {
                    _changeWeaponName: presetData._changeWeaponName,
                    _encyclopedia: presetData._encyclopedia || undefined,
                    _id: presetData._id,
                    _items: presetData._items.map((itemData: any) => {
                        const item: Item = {
                            _id: itemData._id,
                            _tpl: itemData._tpl
                        };

                        // Add parentId and slotId only if they are present in itemData
                        if (itemData.parentId) {
                            item.parentId = itemData.parentId;
                        }
                        if (itemData.slotId) {
                            item.slotId = itemData.slotId;
                        }

                        return item;
                    }),
                    _name: presetData._name,
                    _parent: presetData._parent,
                    _type: "Preset"
                };

                itemPresets[preset._id] = preset;
                if (this.Instance.debug) {
                    console.log(` - Added weapon preset: ${preset._name}`);
                    console.log(` - Preset: ${JSON.stringify(preset)}`);
                }
            });
        }
    }

    /**
   * Processes traders based on the item configuration.
   *
   * @param {any} itemConfig - The configuration of the item.
   * @param {string} itemId - The ID of the item.
   * @return {void} This function does not return a value.
   */
    private processTraders(
        itemConfig: ConfigItem[string],
        itemId: string
    ): void {
        const tables = this.Instance.database;
        if (!itemConfig.addtoTraders) {
            return;
        }

        const { traderId, traderItems, barterScheme } = itemConfig;

        const traderIdFromMap = traderIDs[traderId];
        const finalTraderId = traderIdFromMap || traderId;
        const trader = tables.traders[finalTraderId];

        if (!trader) {
            return;
        }

        for (const item of traderItems) {
            if (this.Instance.debug) {
                console.log("Processing traders for item:", itemId);
            }
            const newItem = {
                _id: itemId,
                _tpl: itemId,
                parentId: "hideout",
                slotId: "hideout",
                upd: {
                    UnlimitedCount: item.unlimitedCount,
                    StackObjectsCount: item.stackObjectsCount
                }
            };

            trader.assort.items.push(newItem);
            if (this.Instance.debug) {
                console.log(`Successfully added item ${itemId} to the trader ${traderId}`);
            }
        }

        trader.assort.barter_scheme[itemId] = [];

        for (const scheme of barterScheme) {
            if (this.Instance.debug) {
                console.log("Processing trader barter scheme for item:", itemId);
            }
            const count = scheme.count;
            const tpl = currencyIDs[scheme._tpl] || ItemMap[scheme._tpl];

            if (!tpl) {
                throw new Error(
                    `Invalid _tpl value in barterScheme for item: ${itemId}`
                );
            }

            trader.assort.barter_scheme[itemId].push([
                {
                    count: count,
                    _tpl: tpl
                }
            ]);
            if (this.Instance.debug) {
                console.log(`Successfully added item ${itemId} to the barter scheme of trader ${traderId}`);
            }
        }

        trader.assort.loyal_level_items[itemId] = itemConfig.loyallevelitems;
    }

    /**
     * 
     * @param itemConfig 
     * @param itemId 
     */
    private addtoHallofFame(itemConfig, itemId) {
        const hallofFame1 = this.Instance.database.templates.items["63dbd45917fff4dee40fe16e"];
        const hallofFame2 = this.Instance.database.templates.items["65424185a57eea37ed6562e9"];
        const hallofFame3 = this.Instance.database.templates.items["6542435ea57eea37ed6562f0"];
        
        if (itemConfig.addToHallOfFameSmall || itemConfig.addToHallOfFameBig || itemConfig.addToHallOfFameDogtag) {
            const hallOfFames = [hallofFame1, hallofFame2, hallofFame3];
            hallOfFames.forEach((hall) => {
                for (const slot of hall._props.Slots) {
                    if (slot._name.startsWith("smallTrophies") && itemConfig.addToHallOfFameSmall)
                    {
                        for (const filter of slot._props.filters) {
                            if (!filter.Filter.includes(itemId)) {
                                filter.Filter.push(itemId);
                                if (this.Instance.debug) {
                                    console.log(`Added item ${itemId} to filter Hall of Fame ${hall._name}`);
                                }
                            }
                        }
                    }
                    if (slot._name.startsWith("bigTrophies") && itemConfig.addToHallOfFameBig)
                    {
                        for (const filter of slot._props.filters) {
                            if (!filter.Filter.includes(itemId)) {
                                filter.Filter.push(itemId);
                                if (this.Instance.debug) {
                                    console.log(`Added item ${itemId} to filter Hall of Fame ${hall._name}`);
                                }
                            }
                        }
                    }
                    if (slot._name.startsWith("dogtag") && itemConfig.addToHallOfFameDogtag)
                    {
                        for (const filter of slot._props.filters) {
                            if (!filter.Filter.includes(itemId)) {
                                filter.Filter.push(itemId);
                                if (this.Instance.debug) {
                                    console.log(`Added item ${itemId} to filter Hall of Fame ${hall._name}`);
                                }
                            }
                        }
                    }
                }
            });
        }
    }
    
    /**
     * 
     * @param itemConfig 
     * @param itemId 
     */
    private addtoGenerator(itemConfig: ConfigItem[string], itemId: string) {
        const generator = this.Instance.database.hideout.areas.find(
            (area) => area._id === "5d3b396e33c48f02b81cd9f3"
        );
    
        if (generator && itemConfig.addtoGenerator) {
            for (const stageKey in generator.stages) {
                const stage = generator.stages[stageKey];
    
                for (const bonus of stage.bonuses) {
                    if (bonus.type === "AdditionalSlots" && Array.isArray(bonus.filter)) {
                        if (!bonus.filter.includes(itemId)) {
                            bonus.filter.push(itemId);
                            if (this.Instance.debug) {
                                console.log(`Added item ${itemId} as fuel to generator at stage with bonus ID ${bonus.id}`);
                            }
                        }
                    }
                }
            }
        }
    }
    
    private addtoSpecialSlots(itemConfig: ConfigItem[string], itemId: string) {
        if (!itemConfig.addtoSpecialSlots) return;

        const items = (this as any).Instance?.database?.templates?.items as Record<string, any>;
        if (!items) return;

        const target = new Set(["SpecialSlot1","SpecialSlot2","SpecialSlot3"]);

        for (const it of Object.values(items)) {
            const slots = it?._props?.Slots;
            if (!Array.isArray(slots)) continue;

            for (const s of slots) {
                if (!s || !target.has(s._name)) continue;
                const f0 = s._props?.filters?.[0];
                if (!f0) continue;

                f0.Filter ||= [];
                if (!f0.Filter.includes(itemId)) f0.Filter.push(itemId);
            }
        }
    }

    private addToPosterSlots(itemConfig: ConfigItem[string], itemId: string) {
        if (!itemConfig.addtoPosterSlots) return;

        const POSTER_SLOT_NAMES: string[] = [
            "Poster_Security_1", "Poster_Security_2", "Poster_Generator_1",
            "Poster_Generator_2", "Poster_ScavCase_1", "Poster_ScavCase_2",
            "Poster_Stash_1", "Poster_WaterCloset_1", "Poster_ShootingRange_1",
            "Poster_Workbench_1", "Poster_IntelligenceCenter_1", "Poster_Kitchen_1",
            "Poster_MedStation_1", "Poster_AirFilteringUnit_1", "Poster_RestSpace_1",
            "Poster_RestSpace_2", "Poster_RestSpace_3", "Poster_RestSpace_4",
            "Poster_Heating_1", "Poster_Heating_2", "Poster_Heating_3",
            "Poster_Gym_1", "Poster_Gym_2", "Poster_Gym_3",
            "Poster_Gym_4", "Poster_Gym_5", "Poster_Gym_6",
            "Poster_Security_3", "Poster_ShootingRange_2"
        ];

        const tables = this.Instance.database;
        const item = tables?.templates?.items?.["673c7b00cbf4b984b5099181"];
        if (!item || !item._props?.Slots) return;

        for (const slot of item._props.Slots) {
            if (!POSTER_SLOT_NAMES.includes(slot?._name)) continue;

            slot._props ??= {} as any;
            slot._props.filters ??= [];
            if (slot._props.filters.length === 0) {
            slot._props.filters.push({ Filter: [], locked: false });
            }

            for (const f of slot._props.filters) {
                f.Filter ??= [];
                if (!f.Filter.includes(itemId)) {
                    f.Filter.push(itemId);
                    if (this.Instance.debug) {
                        console.log(`Added ${itemId} to ${slot._name}`);
                    }
                }
            }
        }
    }

    private addToStatuetteSlots(itemConfig: ConfigItem[string], itemId: string) {
        if (!itemConfig.addtoStatuetteSlots) return;

        const POSTER_SLOT_NAMES: string[] = [
            "Statuette_Gym_1", "Statuette_PlaceOfFame_1", "Statuette_PlaceOfFame_2",
            "Statuette_PlaceOfFame_3", "Statuette_Heating_1", "Statuette_Heating_2",
            "Statuette_Library_1", "Statuette_Library_2", "Statuette_RestSpace_1",
            "Statuette_RestSpace_2", "Statuette_MedStation_1", "Statuette_MedStation_2",
            "Statuette_Kitchen_1", "Statuette_Kitchen_2", "Statuette_BoozeGenerator_1",
            "Statuette_Workbench_1", "Statuette_IntelligenceCenter_1", "Statuette_ShootingRange_1"
        ];

        const tables = this.Instance.database;
        const item = tables?.templates?.items?.["673c7b00cbf4b984b5099181"];
        if (!item || !item._props?.Slots) return;

        for (const slot of item._props.Slots) {
            if (!POSTER_SLOT_NAMES.includes(slot?._name)) continue;

            slot._props ??= {} as any;
            slot._props.filters ??= [];
            if (slot._props.filters.length === 0) {
            slot._props.filters.push({ Filter: [], locked: false });
            }

            for (const f of slot._props.filters) {
                f.Filter ??= [];
                if (!f.Filter.includes(itemId)) {
                    f.Filter.push(itemId);
                    if (this.Instance.debug) {
                        console.log(`Added ${itemId} to ${slot._name}`);
                    }
                }
            }
        }
    }

    private addPosterToMaps(itemConfig: ConfigItem[string], itemId: string) {
        if (!itemConfig.addPosterToMaps) return;

        const genId = () =>
            (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();

        const locations = this.Instance.database.locations as Record<string, any>;
        let postersAddedTotal = 0;

        for (const locationID in locations) {
            if (!Object.prototype.hasOwnProperty.call(locations, locationID)) continue;

            const location = locations[locationID];
            const mapName = location?.base?.Name ?? "Unknown";
            if (this.Instance.debug)
                console.log(`\n[Processing map] id=${locationID}, name=${mapName}`);

            const spawnpoints = location?.looseLoot?.spawnpoints as any[] | undefined;
            if (!Array.isArray(spawnpoints) || spawnpoints.length === 0) {
                continue;
            }

            let matched = 0;
            let added = 0;

            for (const sp of spawnpoints) {
                const tpl = sp?.template;
                const idStr = tpl?.Id ?? "";
                if (!idStr.toLowerCase().startsWith("flyer")) continue;

                matched++;

                tpl.Items ||= [];
                sp.itemDistribution ||= [];

                if (tpl.Items.some((it: any) => it._tpl === itemId)) continue;

                const newKey = genId();
                tpl.Items.push({
                    _id: newKey,
                    _tpl: itemId,
                    upd: { StackObjectsCount: 1 }
                });

                sp.itemDistribution.push({
                    composedKey: { key: newKey },
                    relativeProbability: 50
                });

                added++;
                if (added <= 5) {
                    if (this.Instance.debug)
                        console.log(`[${locationID}] (${mapName}) +added @ ${sp?.locationId ?? "?"} Id="${idStr}" key=${newKey}`);
                }
            }

            if (this.Instance.debug)
                console.log(`[${locationID}] (${mapName}) Summary: matched=${matched}, added=${added}`);
            postersAddedTotal += added;
        }

        if (this.Instance.debug)
                console.log(`[ALL MAPS] Posters added total: ${postersAddedTotal}`);
    }

    /**
     * Add an item to loose-loot spawnpoints whose template.Id starts with any tag in itemConfig.LootLocation.
     * Example LootLocation:
     * [
     *   { LootName: "lootpoint", Probability: 10 },
     *   { LootName: "info",      Probability: 10 }
     * ]
     */
    private addItemToLootLocations(itemConfig: ConfigItem[string], itemId: string) {
        if (!itemConfig.addtoLootLocation) return;
        if (!itemConfig?.LootLocation || !Array.isArray(itemConfig.LootLocation) || itemConfig.LootLocation.length === 0) {
            return;
        }

        const tagProbMap: Record<string, number> = {};
        for (const entry of itemConfig.LootLocation) {
            if (!entry?.LootName) continue;
            tagProbMap[this.normalizeLootTag(entry.LootName)] = Number(entry.Probability ?? 10);
        }
        const tags = Object.keys(tagProbMap);
        if (tags.length === 0) return;

        const genId = () =>
            (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();

        const locations = this.Instance.database.locations as Record<string, any>;

        for (const locationID in locations) {
            if (!Object.prototype.hasOwnProperty.call(locations, locationID)) continue;

            const location = locations[locationID];
            const mapName = location?.base?.Name ?? "Unknown";
            const spawnpoints = location?.looseLoot?.spawnpoints as any[] | undefined;
            if (!Array.isArray(spawnpoints) || spawnpoints.length === 0) {
                if (this.Instance.debug) console.log(`[${locationID}] (${mapName}) No spawnpoints found`);
                continue;
            }

            let matched = 0;
            let added = 0;

            for (const sp of spawnpoints) {
                const tpl = sp?.template;
                const rawId = tpl?.Id ?? "";
                if (!rawId) continue;

                const normId = this.normalizeLootTag(this.leftOfBracket(rawId));

                let matchTag: string | null = null;
                let matchProb = -1;

                for (const tag of tags) {
                    if (normId.startsWith(tag)) {
                        const p = tagProbMap[tag] ?? 10;
                        if (p > matchProb) {
                            matchTag = tag;
                            matchProb = p;
                        }
                    }
                }

                if (!matchTag) continue;
                matched++;

                tpl.Items ||= [];
                sp.itemDistribution ||= [];

                if (tpl.Items.some((it: any) => it._tpl === itemId)) continue;

                const newKey = genId();

                tpl.Items.push({
                    _id: newKey,
                    _tpl: itemId,
                    upd: { StackObjectsCount: 1 }
                });

                sp.itemDistribution.push({
                    composedKey: { key: newKey },
                    relativeProbability: matchProb > 0 ? matchProb : 10
                });

                added++;

                if (this.Instance.debug && added <= 5) {
                    console.log(
                        `[${locationID}] (${mapName}) +added @ ${sp?.locationId ?? "?"} ` +
                        `Id="${rawId}" tag="${matchTag}" prob=${matchProb} key=${newKey}`
                    );
                }
            }

            if (this.Instance.debug) {
                console.log(`[${locationID}] (${mapName}) Summary: matched=${matched}, added=${added}`);
            }
        }
    }

    private normalizeLootTag(s: string): string {
        return String(s)
            .toLowerCase()
            .trim()
            .replace(/[\s_]+/g, "");
    }

    private leftOfBracket(s: string): string {
        const i = s.indexOf("[");
        return i > -1 ? s.slice(0, i).trim() : s.trim();
    }


    private addQuestItemsToMaps(itemConfig: ConfigItem[string], itemId: string)
    {
        const questLocs = Array.isArray(itemConfig.QuestLocation) ? itemConfig.QuestLocation : [];
        if (questLocs.length === 0) { return; }

        const genId = (): string =>
            (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();

        const idPrefix: string = (itemConfig as any)?.QuestTemplatePrefix ?? "QuestItem";
        const locations = this.Instance.database.locations as Record<string, any>;

        const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");
        const mapAliases: Record<string, string> = {
            [normalize("bigmap")]: "bigmap", [normalize("customs")]: "bigmap",

            [normalize("factory4_day")]: "factory4_day", [normalize("factoryday")]: "factory4_day",

            [normalize("factory4_night")]: "factory4_night", [normalize("factorynight")]: "factory4_night",

            [normalize("interchange")]: "interchange",

            [normalize("laboratory")]: "laboratory", [normalize("lab")]: "laboratory",

            [normalize("lighthouse")]: "lighthouse",

            [normalize("rezervbase")]: "rezervbase", [normalize("reserve")]: "rezervbase",

            [normalize("sandbox")]: "sandbox", [normalize("groundzerolow")]: "sandbox",

            [normalize("sandbox_high")]: "sandbox_high", [normalize("groundzerohigh")]: "sandbox_high",

            [normalize("tarkovstreets")]: "tarkovstreets", [normalize("streets")]: "tarkovstreets",

            [normalize("woods")]: "woods"
        };

        const pointsByMap: Record<string, any[]> = {};
        for (const q of questLocs) {
            const maps: string[] = Array.isArray((q as any).Map) ? (q as any).Map : [];
            for (const m of maps) {
                const key = normalize(m);
                const mapId = mapAliases[key];
                if (!mapId) {
                    if (this.Instance.debug) console.log(`[QuestLoc] Unknown map alias "${m}"`);
                    continue;
                }
                (pointsByMap[mapId] ||= []).push(q);
            }
        }

        for (const mapId in pointsByMap) {
            if (!Object.prototype.hasOwnProperty.call(pointsByMap, mapId)) continue;

            const location = locations[mapId];
            if (!location) {
                if (this.Instance.debug) console.log(`[QuestLoc] Map "${mapId}" not found in DB`);
                continue;
            }

            const mapName = location?.base?.Name ?? mapId;
            const looseLoot = location?.looseLoot;
            if (!looseLoot) { continue; }

            looseLoot.spawnpointsForced ||= [];
            const forced = looseLoot.spawnpointsForced as any[];

            const pts = pointsByMap[mapId];
            const isGrouped = pts.length > 1;

            const first = pts[0];
            const firstLocIdStr = `(${first.Position.x}, ${first.Position.y}, ${first.Position.z})`;

            const alreadyExists = forced.some(sp =>
                sp?.locationId === firstLocIdStr &&
                sp?.template?.Items?.some((it: any) => it?._tpl === itemId)
            );
            if (alreadyExists) { continue; }

            const rootId = genId();
            const templateId = `${idPrefix} (${pts.length}) [${genId()}]`;

            const groupPositions = isGrouped
                ? pts.map((loc, idx) => ({
                    Name: `groupPoint[${idx}]`,
                    Weight: 1,
                    Position: { x: loc.Position.x, y: loc.Position.y, z: loc.Position.z },
                    Rotation: { x: loc.Rotation.x, y: loc.Rotation.y, z: loc.Rotation.z }
                }))
                : [];

            const template = {
                Id: templateId,
                IsContainer: false,
                useGravity: false,
                randomRotation: false,
                Position: { x: first.Position.x, y: first.Position.y, z: first.Position.z },
                Rotation: { x: first.Rotation.x, y: first.Rotation.y, z: first.Rotation.z },
                IsGroupPosition: isGrouped,
                GroupPositions: groupPositions,
                IsAlwaysSpawn: false,
                Root: rootId,
                Items: [
                    {
                        _id: rootId,
                        _tpl: itemId,
                        upd: { StackObjectsCount: 1 }
                    }
                ]
            };

            forced.push({
                locationId: firstLocIdStr,
                probability: (first as any)?.Probability ?? 1,
                template
            });

            if (this.Instance.debug) {
                if (!isGrouped) {
                    console.log(`[${mapId}] (${mapName}) +quest @ ${firstLocIdStr} Id="${templateId}" _tpl=${itemId}`);
                } else {
                    console.log(
                        `[${mapId}] (${mapName}) +quest-group size=${pts.length} first=${firstLocIdStr} Id="${templateId}" _tpl=${itemId}`
                    );
                }
            }
        }
    }

    private addCustomSlotPatch(itemConfig: ConfigItem[string], itemId: string) {
        type SlotFilter = { Filter: string[]; Shift?: number; AnimationIndex?: number }
        type SlotProps = { filters: SlotFilter[] }

        const db = this.Instance?.database
        const cfg = (itemConfig as any)?.slotPatch
        if (!db?.templates?.items || !cfg?.parentTpl) return

        const createIfMissing = cfg.createIfMissing !== false

        const parentsRaw = Array.isArray(cfg.parentTpl) ? cfg.parentTpl : [cfg.parentTpl]
        const parents = parentsRaw.map((p: any) => typeof p === "string" ? { tpl: p } : p)

        for (const p of parents) {
            const parentTpl = ItemMap[p.tpl] || p.tpl
            const proto = p.proto || "55d30c4c4bdc2db4468b457e"
            const targetId = p.newSlotId || require("crypto").randomBytes(12).toString("hex")
            const nameWhenCreate = p.name || cfg.slotName || "mod_muzzle"

            const item = db.templates.items[parentTpl]
            if (!item?._props) continue

            item._props.Slots ||= []

            // Try to find existing slot by name or by id when slotName omitted
            let slot = cfg.slotName
                ? item._props.Slots.find(s => s?._name?.toLowerCase() === cfg.slotName.toLowerCase())
                : item._props.Slots.find(s => s?._id === targetId) ||
                item._props.Slots.find(s => s?._name?.toLowerCase() === "mod_muzzle")

            if (!slot) {
                if (!createIfMissing) continue
                const props: SlotProps = { filters: [{ Filter: [] }] }
                slot = {
                    _id: targetId,
                    _mergeSlotWithChildren: false,
                    _name: nameWhenCreate,
                    _parent: parentTpl,
                    _props: props as any,
                    _proto: proto,
                    _required: false
                }
                item._props.Slots.push(slot)
            }

            if (!slot._props || !Array.isArray((slot._props as any).filters) || (slot._props as any).filters.length === 0) {
                const props: SlotProps = { filters: [{ Filter: [] }] }
                slot._props = props as any
            }

            const f0: SlotFilter = (slot._props as any).filters[0]
            f0.Filter = f0.Filter ?? []
            if (!f0.Filter.includes(itemId)) f0.Filter.push(itemId)

            if (this.Instance.debug)
                console.log(`Patched ${parentTpl} ${slot._name} with ${itemId} (slotId=${slot._id})`)
        }
    }

    /**
     * Processes the bot inventories based on the given item configuration.
     *
     * @param {ConfigItem[string]} itemConfig - The item configuration.
     * @param {string} finalItemTplToClone - The final item template to clone.
     * @param {string} itemId - The item ID.
     * @return {void} This function does not return anything.
     */
    private processBotInventories(
        itemConfig: ConfigItem[string],
        finalItemTplToClone: string,
        itemId: string
    ): void {
        const tables = this.Instance.database;

        if (!itemConfig.addtoBots) return;

        if (this.Instance.debug) {
            console.log("Processing bot inventories for item:", itemId);
        }

        // Iterate through bot types
        for (const botId in tables.bots.types) {
            const botType = botId;
            const botInventory = tables.bots.types[botId].inventory;

            botInventory.Ammo = botInventory.Ammo || {};

            // Process items and equipment
            this.processInventoryType(botInventory.items, finalItemTplToClone, itemId, botType, "items");
            this.processInventoryType(botInventory.equipment, finalItemTplToClone, itemId, botType, "equipment");

            // Process mods if applicable
            if (itemConfig.addtoModSlots && itemConfig.modSlot) {
                this.processBotModSlots(finalItemTplToClone, itemId, botType, itemConfig.modSlot);
            }
        }
    }

    /**
     * Processes inventory type (items or equipment) and gathers mods based on Slots.
     *
     * @param {any} inventoryType - The inventory type to process.
     * @param {string} finalTplToClone - The final item template to clone.
     * @param {string} itemId - The item ID.
     * @param {string} botType - The bot type identifier.
     * @param {string} typeLabel - Label indicating items or equipment.
     * @return {void} This function does not return anything.
     */
    private processInventoryType(
        inventoryType: any,
        finalTplToClone: string,
        itemId: string,
        botType: string,
        typeLabel: string
    ): void {
        const tables = this.Instance.database;
        if (typeLabel === "equipment" && (
            (inventoryType.FirstPrimaryWeapon && inventoryType.FirstPrimaryWeapon[finalTplToClone]) ||
            (inventoryType.SecondPrimaryWeapon && inventoryType.SecondPrimaryWeapon[finalTplToClone]) ||
            (inventoryType.Holster && inventoryType.Holster[finalTplToClone])
        )) {
            if (!this.ensureValidWeaponPreset(itemId)) {
                return;
            }
            else {
                this.processAmmoAndChambers(tables.bots.types[botType].inventory, tables.templates.items[itemId]._props, itemId, botType);
            }
        }

        for (const lootSlot in inventoryType) {
            const items = inventoryType[lootSlot];
            if (items && items[finalTplToClone] !== undefined) {
                const weight = items[finalTplToClone];
                if (this.Instance.debug) {
                    console.log(` - Adding item to bot ${typeLabel} for bot type: ${botType} in loot slot: ${lootSlot} with weight: ${weight}`);
                }
                items[itemId] = weight;

                this.addModsToItem(tables, itemId, botType);
            }
        }
    }

    /**
     * Adds mods to an item based on its Slots configuration.
     *
     * @param {any} tables - The database tables.
     * @param {string} itemId - The item ID.
     * @param {string} botType - The bot type identifier.
     * @return {void} This function does not return anything.
     */
    private addModsToItem(tables: IDatabaseTables, itemId: string, botType: string): void {
        const itemProps = tables.templates.items[itemId]._props;
        if (itemProps && itemProps.Slots) {
            for (const slot of itemProps.Slots) {
                const slotName = slot._name;
                const filters = slot._props.filters;
                if (filters && filters.length > 0) {
                    for (const filter of filters) {
                        for (const modId of filter.Filter) {
                            if (modId && tables.templates.items[modId]) {
                                tables.bots.types[botType].inventory.mods[itemId] = tables.bots.types[botType].inventory.mods[itemId] || {};
                                tables.bots.types[botType].inventory.mods[itemId][slotName] = tables.bots.types[botType].inventory.mods[itemId][slotName] || [];
                                if (!tables.bots.types[botType].inventory.mods[itemId][slotName].includes(modId)) {
                                    tables.bots.types[botType].inventory.mods[itemId][slotName].push(modId);
                                    if (tables.templates.items[modId]._props) {
                                        if (tables.templates.items[modId]._props.Slots.length > 0) {
                                            this.addModsToItem(tables, modId, botType);
                                        }
                                    }
                                }
                                if (this.Instance.debug) {
                                    console.log(` - Added mod ${modId} to ${itemId}'s ${slotName} of bot type ${botType}`);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Processes mod slots and adds itemId to specified slots if finalItemTplToClone is present.
     *
     * @param {any} mods - The mods inventory.
     * @param {string} finalItemTplToClone - The final item template to clone.
     * @param {string} itemId - The item ID.
     * @param {string} botType - The bot type identifier.
     * @param {string[]} modSlots - The list of mod slots to process.
     * @return {void} This function does not return anything.
     */
    private processBotModSlots(
        finalItemTplToClone: string,
        itemId: string,
        botType: string,
        modSlots: string[]
    ): void {
        const mods = this.Instance.database.bots.types[botType].inventory.mods;
        for (const item in mods) {
            const itemMods = mods[item];

            for (const modSlot of modSlots) {
                if (itemMods[modSlot] && itemMods[modSlot].includes(finalItemTplToClone)) {
                    itemMods[modSlot].push(itemId);
                    if (this.Instance.debug) {
                        console.log(` - Added item ${itemId} to mod slot ${modSlot} for bot type ${botType} in item ${item}`);
                    }

                    // Adding nested mods for the new item
                    this.addModsToItem(this.Instance.database, itemId, botType);
                }
            }
        }
    }

    /**
     * Processes ammo and chambers, adding calibers and chamber filters if needed.
     *
     * @param {any} botInventory - The bot's inventory.
     * @param {any} itemProps - The properties of the item.
     * @param {string} itemId - The item ID.
     * @param {string} botType - The bot type identifier.
     * @return {void} This function does not return anything.
     */
    private processAmmoAndChambers(
        botInventory: any,
        itemProps: any,
        itemId: string,
        botType: string
    ): void {
        const ammoCaliber = itemProps.ammoCaliber;
        if (!ammoCaliber) return;

        botInventory.Ammo[ammoCaliber] = botInventory.Ammo[ammoCaliber] || {};

        if (this.Instance.debug) {
            console.log(` - Added new caliber ${ammoCaliber} to bot inventory for bot type ${botType}`);
        }

        if (itemProps.Chambers) {
            for (const chamber of itemProps.Chambers) {
                const filters = chamber._props.filters;
                if (filters && filters.length > 0) {
                    for (const filter of filters) {
                        for (const filterItem of filter.Filter) {
                            botInventory.Ammo[ammoCaliber][filterItem] = botInventory.Ammo[ammoCaliber][filterItem] || 0;
                            if (this.Instance.debug) {
                                console.log(` - Added filter item ${filterItem} to caliber ${ammoCaliber} in bot inventory for bot type ${botType}`);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Ensures the weapon has a valid preset in the global ItemPresets.
     *
     * @param {string} itemId - The item ID.
     * @return {boolean} True if the weapon has a valid preset, false otherwise.
     */
    private ensureValidWeaponPreset(itemId: string): boolean {
        const db = this.Instance.database;
        const presets : Record<string, IPreset> = db.globals.ItemPresets;
        for (const presetObj of Object.values(presets)) {
            if (presetObj._items[0]._tpl === itemId) {
                if (this.Instance.debug) {
                    console.log(` - Valid preset found for item ${itemId}`);
                }
                return true;
            }
        }
        if (this.Instance.debug) {
            console.warn(`No valid preset found for item ${itemId} in globals.ItemPresets`);
        }
        return false;
    }

    /**
   * Loads and combines multiple configuration files into a single ConfigItem object.
   *
   * @return {any} The combined configuration object.
   */
    private loadCombinedConfig(): any {
        const configFiles = fs
            .readdirSync(path.join(__dirname, "../db/Items"))
            .filter((file) => !file.includes("BaseItemReplacement"));

        const combinedConfig: any = {};

        configFiles.forEach((file) => {
            const configPath = path.join(__dirname, "../db/Items", file);
            const configFileContents = fs.readFileSync(configPath, "utf-8");
            const config = JSON.parse(configFileContents) as ConfigItem;

            Object.assign(combinedConfig, config);
        });

        return combinedConfig;
    }
}
