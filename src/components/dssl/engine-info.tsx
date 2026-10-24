"use client";

import { createContext, useContext } from "react";
import type { EngineInfo } from "@/lib/engine-info";

const EngineInfoContext = createContext<EngineInfo>({ version: "", rawKb: 0, gzKb: 0 });

export const EngineInfoProvider = EngineInfoContext.Provider;
export const useEngineInfo = () => useContext(EngineInfoContext);
