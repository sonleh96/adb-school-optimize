export type IndicatorMetadata = {
  unit: string;
  direction: string;
};

export function indicatorMetadata(indicator: string): IndicatorMetadata {
  const label = indicator.toLowerCase();

  if (label.includes("aqi")) return { unit: "AQI", direction: "Higher values indicate poorer air quality." };
  if (label.includes("speed")) return { unit: "Mbps", direction: "Higher values indicate faster service." };
  if (label.includes("access") || label.includes("rate")) {
    return { unit: "%", direction: "Higher values indicate broader access or progression." };
  }
  if (label.includes("emission")) {
    return { unit: "tonnes CO2e", direction: "Higher values indicate a greater emissions burden." };
  }
  if (label.includes("fatalit") || label.includes("event")) {
    return { unit: "count", direction: "Higher values indicate greater conflict exposure." };
  }
  if (label.includes("population exposure")) {
    return { unit: "people", direction: "Higher values indicate more people exposed." };
  }
  if (label.includes("student") || label.includes("population") || label.includes("enrollment")) {
    return { unit: "people", direction: "Use as contextual scale rather than a good-or-bad direction." };
  }
  if (label.includes("luminosity")) {
    return { unit: "index", direction: "Higher values indicate brighter nighttime light." };
  }

  return { unit: "value", direction: "Interpret direction using the methodology and source definition." };
}
