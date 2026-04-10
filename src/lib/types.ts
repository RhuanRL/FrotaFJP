export type VehicleType = "furgao" | "caminhao";

export interface Delivery {
  id: string;
  nfNumber: string;
  clientName: string;
  address: string;
  cep: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  weight?: number;
  value?: number;
  createdAt: string;
  distanceFromOrigin?: number; // km
  vehicleType?: VehicleType;
}

export interface RouteStop {
  delivery: Delivery;
  order: number;
  distanceFromPrevious: number; // km
  timeFromPrevious: number; // minutes
}

export interface OptimizedRoute {
  stops: RouteStop[];
  totalDistance: number; // km
  totalTime: number; // minutes
  fuelEstimate: number; // liters
  costEstimate: number; // R$
  geometry: [number, number][];
}

export interface DeliveryWindow {
  id: string;
  name: string;
  cutoffTime: string; // HH:mm
  departureTime: string; // HH:mm
  isNextDay: boolean;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: VehicleType;
  driver: string;
  consumption: number; // km/l
  capacity?: number; // kg
}

export interface AppConfig {
  originAddress: string;
  originLat: number;
  originLng: number;
  fuelPricePerLiter: number; // R$
  vehicleConsumption: number; // km/l (default para furgão)
  truckConsumption: number; // km/l (caminhão)
  localRadiusKm: number; // raio para entregas locais (furgão)
  deliveryWindows: DeliveryWindow[];
  vehicles: Vehicle[];
}

export const DEFAULT_CONFIG: AppConfig = {
  originAddress: "Rua Guarai, Vila Brasília, Aparecida de Goiânia, GO - CEP 74905-330",
  originLat: -16.7364989,
  originLng: -49.2627635,
  fuelPricePerLiter: 6.0,
  vehicleConsumption: 10, // furgão: 10 km/l
  truckConsumption: 5, // caminhão: 5 km/l
  localRadiusKm: 50,
  deliveryWindows: [
    {
      id: "morning",
      name: "Manhã",
      cutoffTime: "08:00",
      departureTime: "09:00",
      isNextDay: false,
    },
    {
      id: "afternoon",
      name: "Tarde",
      cutoffTime: "13:00",
      departureTime: "14:00",
      isNextDay: false,
    },
    {
      id: "next-day",
      name: "Próximo dia",
      cutoffTime: "17:00",
      departureTime: "08:00",
      isNextDay: true,
    },
  ],
  vehicles: [
    {
      id: "furgao-1",
      name: "Furgão 1",
      plate: "PAD2019",
      type: "furgao",
      driver: "TIAGO RIBEIRO DE SOUZA",
      consumption: 10,
    },
    {
      id: "caminhao-1",
      name: "Caminhão VW 13.180",
      plate: "QTN2D49",
      type: "caminhao",
      driver: "GERONY NUNES DE OLIVEIRA FILHO",
      consumption: 5,
    },
  ],
};

// Haversine distance in km
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
