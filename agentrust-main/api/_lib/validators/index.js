import { createValidatorOneConfig } from "./validator-1.js";
import { createValidatorTwoConfig } from "./validator-2.js";

export function getValidatorConfigs(computeLabel) {
  return [
    createValidatorOneConfig(computeLabel),
    createValidatorTwoConfig(computeLabel),
  ];
}
