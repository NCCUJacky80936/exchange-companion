import profileData from "../../config/exchange-profile.json";

export interface ExchangeProfile {
  schemaVersion: 1;
  appName: string;
  ownerName: string;
  homeCity: string;
  homeCountry: string;
  homeTimeZone: string;
  hostCity: string;
  hostCountry: string;
  hostCountryCode: string;
  hostTimeZone: string;
  hostSchool: string;
  program: string;
  startDate: string;
  endDate: string;
  orientationDate: string;
  primaryCurrency: string;
  secondaryCurrency: string;
  language: string;
  visual: {
    routeLabel: string;
    heroImage: string;
    socialImage: string;
    icon: string;
    generatedFor: {
      homeCity: string;
      hostCity: string;
    };
  };
  research: {
    minimumVerifiedDate: string;
    preferredOfficialDomains: string[];
  };
}

export const exchangeProfile = profileData as ExchangeProfile;

export const exchangeCurrencies = Array.from(
  new Set([exchangeProfile.primaryCurrency, exchangeProfile.secondaryCurrency]),
);

export const exchangeTimeZones = Array.from(
  new Set([exchangeProfile.hostTimeZone, exchangeProfile.homeTimeZone]),
);
