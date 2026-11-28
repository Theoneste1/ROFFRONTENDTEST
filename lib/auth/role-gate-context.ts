"use client";

import { createContext, useContext } from "react";

/**
 * True inside a portal's RoleGate. There RoleGate makes the one navigation after a sign-out (to `afterSignOut`);
 * outside it (sign-in, support, error pages) the component that signed out navigates itself.
 */
export const InsideRoleGate = createContext(false);

export const useInsideRoleGate = () => useContext(InsideRoleGate);
