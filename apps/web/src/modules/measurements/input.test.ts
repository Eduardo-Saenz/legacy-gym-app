import { expect, test } from "vitest";
import { correction, newMeasurement } from "./input";

test("valida unidades, precisión, calendario y límites de peso y estatura", () => {
  expect(newMeasurement("weight", "kg", "72.55", "2025-01-02")).toEqual({
    kind_value: "weight",
    unit_value: "kg",
    amount: 72.55,
    measured: "2025-01-02",
  });
  expect(newMeasurement("weight", "cm", 75, "2025-01-02")).toBeNull();
  expect(newMeasurement("height", "cm", 500, "2025-01-02")).toBeNull();
  expect(newMeasurement("height", "cm", 175.123, "2025-01-02")).toBeNull();
  expect(newMeasurement("height", "cm", 175, "2025-02-30")).toBeNull();
  expect(newMeasurement("height", "cm", 175, "2999-01-01")).toBeNull();
});

test("exige un motivo y la versión de la medición observada", () => {
  const id = "70000000-0000-0000-0000-000000000001";
  expect(correction(id, "0", "70.5", " Ajuste ")).toEqual({
    measurement: id,
    expected_version: 0,
    amount: 70.5,
    explanation: "Ajuste",
  });
  expect(correction(id, "", "70.5", "Ajuste")).toBeNull();
  expect(correction(id, 1, 70, " ")).toBeNull();
  expect(correction(id, 1, 70, "a".repeat(301))).toBeNull();
});
