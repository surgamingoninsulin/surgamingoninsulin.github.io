---
title: ExoticGarden
summary: A rebar addon plugin.
logo-image: icon.png
header-image: icon.png
icon: downloads/plugins/exoticgarden/icon.png
categories: [Vanilla-like, Plugins, Rebar, Addons]
featured: true
links:
  source:
versions:
  - version: none
    mc: [
      "26.2", 
      "26.3"
    ]
    file: https://example.com/
    date: 2026-09-21
    changelog: Initial release.
---

## About

***ExoticGarden**
I've always liked how Slimefun's Exotic Garden module made farming actually feel worth doing — real fruit trees, real cooking, food that isn't just "eat steak, done." This is my attempt at building that same feeling, but on Pylon (using the Rebar framework underneath) instead. Fruit trees, bushes, a whole vegetable patch, some kitchen machines worth building, and a food & drink chain that goes all the way from "pick a tomato" to "serve a pizza."

It's early. Right now this is still mostly the Rebar addon template with the namespace wired up to io.github.surgamingoninsulin.exoticgarden (main class ExoticGardenAddon), pinned to rebar.version=0.36.2 / pylon.version=0.33.2 in gradle.properties. Both Rebar and Pylon call themselves experimental upstream, so I'm not chasing the newest version the moment it drops — I'd rather build on something stable and bump deliberately.

If you're picking this project back up (me, future-me, or an AI helping out): CLAUDE.md has the repo conventions, and .claude/docs/rebar-pylon-reference.md has the Rebar/Pylon API notes I've cached from their docs so I'm not re-Googling the same things every session.

The plan below is the same content list I started with, just broken into phases so it's actually buildable instead of one giant wishlist. Each phase has what needs to exist by the end of it, and some open questions I haven't settled yet — decisions to make when I actually get there, not things to guess at now.

Phase 0 — Setup & Foundations
Where things stand right now.

Repo's off the Rebar template, namespace cleaned up and pointing at exoticgarden everywhere (package, group, main-class, rootProject.name, IDE module names — all of it).
ExoticGardenAddon registers with Rebar and kicks off *Items/*Blocks init on enable.
Kept the template's ExampleItem/ExampleBlock/ExampleAddonItems etc. around on purpose — they're the worked examples I'll be copying from once real content starts, not something to delete yet.
./gradlew runServer + /rb give <player> <key> works for local testing.
Things I still need to figure out before Phase 1 can really start:

One shared base block class for growth stages across crops/bushes/vegetables, or one class per plant? Matters a lot once there are 30+ of these.
A key-naming convention (fruit_tree_cherry, bush_blueberry, veg_tomato, something like that) so I'm not improvising it 35 times.
I haven't actually read Rebar's block-interfaces doc yet (documentation/reference/blocks/interfaces/) — need to know what growth/tick hook exists before I can design a tree's growth stages sensibly.
Phase 1 — Fruit Trees
Cherry, coconut, dragon fruit, lemon, lime, cowberry, banana, peach, orange, pear, plum, pomegranate, apple. Thirteen trees. Each one needs a sapling, a growing state, a ripe/harvestable state, and a fruit item that drops.

Open questions:

Growth timing — plain scheduled Bukkit tick, or whatever tick/growth interface Rebar exposes for multi-stage blocks? Need the answer from Phase 0's doc gap before writing the first tree.
I'd like one FruitTreeBlock base class handling growth + harvest, with per-tree numbers (fruit item, growth time, yield) pulled from settings/<tree_id>.yml. Thirteen near-identical block classes sounds miserable to maintain.
Single block with visual stages vs. an actual small multiblock (trunk + canopy)? The multiblock looks nicer but it's real dev time × 13. Probably starting with single blocks and revisiting if it feels flat.
Phase 2 — Bushes
Blackberry, blueberry, raspberry, elderberry, cowberry. Same shape as the trees, just smaller — no multiblock needed here, a single block is plenty.

If the Phase 1 growth-stage base class is generic enough, a bush is basically "a tree with fewer stages" — reuse it before building a separate BushBlock hierarchy.
Small thing I noticed: cowberry is on both the fruit tree list and the bush list from the original idea. Need to actually pick one before I get to it — currently it's just sitting in both.
Phase 3 — Vegetables
The big one: garlic, lettuce, mustard seed, onion, strawberry, sweet potato, tomato, curry leaf, corn, grape, pineapple, rice, cabbage, tea leaf, spinach. Fifteen items — this probably wants vanilla-style crop behavior (farmland + age property) rather than the tree/bush growth-stage approach.

Worth checking if Rebar lets me hook into a wheat-style [age=0..7] BlockData property directly — that'd be way cheaper than a fully custom block for 15 vegetables.
Rice and tea leaf might not want plain farmland (paddy field? different soil?) — flagging that now so I don't bake a farmland-only assumption into the shared crop base class.
Phase 4 — Specialized Machines
Multiblock kitchen, multiblock juicer, a crook tool (better harvest drops), and sprinklers/irrigation/Soil Hydrators using Pylon's fluid system. This is the first phase that actually touches Rebar's multiblock and fluid APIs instead of plain blocks/items, so I'm giving myself more research time here rather than rushing in.

Starting the kitchen and juicer with RebarSimpleMultiblock — it gives ghost-block previews for free. Only reaching for the full RebarMultiblock API if simple can't express "recipe in progress" state.
Still haven't read the multiblock-state / component-interaction docs — need those before either machine can actually track a craft happening inside it.
For sprinklers/Soil Hydrators: model water as a RebarFluid, mark it a base ingredient via IngredientCalculator, and go read the fluid-system-blocks doc for how a consumer block actually pulls from a pipe network. Haven't done that yet either.
The crook tool is the easy one here — just a RebarInteractor tool with a drop-multiplier check on harvest. No multiblock or fluid involvement.
Phase 5 — Condiments & Ingredients
Mayonnaise, mustard, bbq sauce, cornmeal, heavy cream, tofu. None of these are meant to be eaten on their own — they're inputs for everything in Phases 6 through 9, so I want them solid before building recipes on top of them.

Some of these (mayonnaise, heavy cream especially) might actually need the Phase 4 kitchen rather than a plain crafting-table recipe. Deciding per-item, not blanket.
Cornmeal and tofu are processing outputs — corn from Phase 3, something soy/vegetable-based for tofu. Make sure the source ingredient actually exists before wiring the recipe.
Phase 6 — Snacks & Fast Food
Cheeseburgers, BLT, tacos, burritos, french fries, bacon. This is the first tier of actual food, so it's a good spot to nail down how custom food/hunger/saturation works before Phase 7's bigger dish list makes that expensive to change.

Need to check whether Pylon already has custom-food support built in, or whether I'm rolling my own consumable component. Haven't checked the Javadoc for this yet.
French fries and bacon double as toppings/ingredients elsewhere on the menu — they might belong partly in Phase 5's ingredient tier too. Not a big deal either way, just noting it.
Phase 7 — Gourmet Dishes
Chicken curry, coconut chicken, lasagna, fish & chips, sushi, egg salad, pizza(s). (Chicken curry was listed twice in my original notes — that's just a typo, not two dishes.) This is the most complex recipe tier — most of these probably want the kitchen multiblock rather than a flat crafting recipe.

"Pizza(s)" implies toppings/variants. One parameterized item+recipe, or a handful of fully separate pizzas? Either way it affects how many lang/recipe files exist, so picking a pattern before starting.
Curry leaf (Phase 3) and coconut (Phase 1) feed straight into the curry dishes — those need to exist first, which they will if the phases go in order.
Phase 8 — Pies, Cakes & Desserts
Cheesecake, fruit pies, cupcakes, ice cream. "Fruit pies" isn't one item — it's a family, basically one per fruit tree from Phase 1.

Same fork as pizza in Phase 7: one parameterized "any fruit + crust → <Fruit> Pie" recipe, or a separate item per fruit? Whatever I decide here, reuse the same pattern for pizza and vice versa — don't invent a third approach.
Ice cream probably wants some kind of "cold" step. If a freezer/cooling mechanic ends up mattering, that's an extension of Phase 4's fluid work, not a new system.
Phase 9 — Beverages & Smoothies
Fruit juice, smoothies, teas. The juicer from Phase 4 is basically built for this. Teas need the tea leaf vegetable from Phase 3 to exist first.

Juice/smoothies are almost certainly another per-fruit family, same shape as the pie/pizza decision. Reuse whichever pattern I already picked.
Do drinks need their own "drinkable" item (bottle/cup), or can I get away with vanilla potion-style consumption? Worth checking the Javadoc before committing to custom behavior here.
Final Phase — Polish & Release
The stuff that makes it feel like a real addon instead of a pile of items.

Full translation pass on lang/en.yml (and anything else getLanguages() ends up covering).
Go through every item/block/fluid and make sure it's on a sensible PylonPages page — not sitting in MISCELLANEOUS because that's what the template defaulted to.
Research/progression pass in researches.yml so 35+ plants and dozens of food items unlock gradually instead of all being available on day one.
Double-check compatibility against whatever rebar.version/pylon.version I'm pinned to at that point — bump on purpose, not because Gradle auto-updated something.
Nice-to-haves if there's time:

Hide any purely internal/processing fluids or items (like an in-progress juicer fluid) from the guide rather than exposing plumbing players don't need to see.
A WAILA pass on the Phase 4 machines so players can glance at multiblock/juicer state without opening a GUI.
