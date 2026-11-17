"use client";

import { createContext, useContext } from "react";

/**
 * Where a portal sidebar is rendered: the desktop rail (the "More" menu opens a panel beside it) or the mobile /
 * tablet drawer (the "More" menu expands inline, the drawer being too narrow to have a panel beside it).
 */
export type SidebarPlacement = "rail" | "drawer";

export const SidebarPlacementContext = createContext<SidebarPlacement>("rail");

export const useSidebarPlacement = () => useContext(SidebarPlacementContext);
