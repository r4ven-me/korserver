import { chromium } from "@playwright/test";
import { readFileSync } from "fs";

const script = readFileSync("./repro.mjs", "utf8");
