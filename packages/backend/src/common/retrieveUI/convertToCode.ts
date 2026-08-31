import { PluginSettings } from "types";
import { composeMain } from "../../compose/composeMain";
import { flutterMain } from "../../flutter/flutterMain";
import { htmlMain } from "../../html/htmlMain";
import { swiftuiMain } from "../../swiftui/swiftuiMain";
import { tailwindMain } from "../../tailwind/tailwindMain";

export const convertToCode = async (
  nodes: SceneNode[],
  settings: PluginSettings,
) => {
  switch (settings.framework) {
    case "Tailwind":
      return await tailwindMain(nodes, settings);
    case "Flutter":
      return await flutterMain(nodes, settings);
    case "SwiftUI":
      return await swiftuiMain(nodes, settings);
    case "Compose":
      return composeMain(nodes, settings);
    case "WordPress":
      // Phase 9 (D115/D118): the WordPress tab shows no syntax-highlighted
      // code at all (CodePanel renders a feedback panel instead), and
      // generation isn't wired up yet -- no point running a full HTML
      // conversion just to discard it.
      return "";
    case "HTML":
    default:
      return (await htmlMain(nodes, settings)).html;
  }
};
