// City → region, used to search broadly and to balance the photo set so no
// single part of the world dominates (meetings are global).
export const CITY_REGION = {
  // India & South Asia (historic names too: Commons categorises older photos under them)
  Mumbai: "South Asia", Bombay: "South Asia", Kolkata: "South Asia", Calcutta: "South Asia",
  Delhi: "South Asia", "New Delhi": "South Asia", Chennai: "South Asia", Madras: "South Asia",
  Bangalore: "South Asia", Hyderabad: "South Asia", Karachi: "South Asia", Lahore: "South Asia",
  Dhaka: "South Asia", Colombo: "South Asia", Kathmandu: "South Asia",
  // UK & Ireland
  London: "UK & Ireland", Edinburgh: "UK & Ireland", Manchester: "UK & Ireland", Glasgow: "UK & Ireland",
  Liverpool: "UK & Ireland", Dublin: "UK & Ireland", Belfast: "UK & Ireland",
  // Mainland Europe
  Paris: "Europe", Berlin: "Europe", Amsterdam: "Europe", Stockholm: "Europe", Copenhagen: "Europe",
  Helsinki: "Europe", Vienna: "Europe", Rome: "Europe", Madrid: "Europe", Barcelona: "Europe",
  Lisbon: "Europe", Prague: "Europe", Warsaw: "Europe", Budapest: "Europe", Munich: "Europe",
  Milan: "Europe", Brussels: "Europe", Zürich: "Europe", Oslo: "Europe", Athens: "Europe",
  // North America
  "New York City": "North America", Chicago: "North America", "San Francisco": "North America",
  "Los Angeles": "North America", Boston: "North America", "Washington, D.C.": "North America",
  Toronto: "North America", Montreal: "North America", Vancouver: "North America",
  // East & Southeast Asia
  Tokyo: "East Asia", "Hong Kong": "East Asia", Seoul: "East Asia", Shanghai: "East Asia",
  Singapore: "East Asia", Bangkok: "East Asia", Taipei: "East Asia", Osaka: "East Asia",
  // Rest of world
  Sydney: "Rest of world", Melbourne: "Rest of world", "Mexico City": "Rest of world",
  "Buenos Aires": "Rest of world", "Rio de Janeiro": "Rest of world", "São Paulo": "Rest of world",
  Cairo: "Rest of world", Istanbul: "Rest of world", "Cape Town": "Rest of world", Nairobi: "Rest of world",
};

// Country-level Commons categories ("1965 in India", "1960s photographs of India")
// fill regions whose city categories are sparse.
export const COUNTRY_REGION = {
  India: "South Asia", Pakistan: "South Asia", Bangladesh: "South Asia", "Sri Lanka": "South Asia",
  Japan: "East Asia", China: "East Asia",
  Ireland: "UK & Ireland", Scotland: "UK & Ireland",
  Mexico: "Rest of world", Brazil: "Rest of world", Egypt: "Rest of world", Turkey: "Rest of world",
  "South Africa": "Rest of world", Australia: "Rest of world", Nigeria: "Rest of world", Kenya: "Rest of world",
};

export const REGIONS = ["South Asia", "Europe", "UK & Ireland", "North America", "East Asia", "Rest of world"];

export const regionOf = (place) => CITY_REGION[place] ?? COUNTRY_REGION[place] ?? "Rest of world";
