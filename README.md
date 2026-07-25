# Japan Real Estate Scraper

Extract comprehensive property data from RealEstate.co.jp, Japan's largest international property platform. Collect for-sale and rental listings with prices, locations, sizes, station access, and agent details. Perfect for market research, investment analysis, and portfolio monitoring.

## Features

- **Property Search** - Extract listings by location, property type, and price range
- **Complete Data** - Collect prices, sizes, layouts, station access, images, and agent info
- **Pagination Support** - Automatically browse multiple result pages
- **Stealth Extraction** - Bypass anti-bot protection with browser-level headers
- **Custom Filters** - Filter by prefecture, property type, min/max price, and more

---

## Use Cases

### Market Research

Track property prices and trends across Japan's real estate market. Analyze pricing by location, property type, and size to identify market opportunities.

### Investment Analysis

Monitor investment properties with yield data. Compare prices across Tokyo, Osaka, and other major Japanese cities for informed investment decisions.

### Portfolio Management

Build a comprehensive database of Japanese properties for portfolio tracking. Keep updated records of listings, prices, and agent contacts.

### Competitive Intelligence

Track competitor listings and pricing strategies. Understand how properties are positioned across different agents and regions in Japan.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | - | Full RealEstate.co.jp search URL to scrape. Overrides other filters. |
| `location` | String | No | `JP-13` | Prefecture code (JP-13 for Tokyo, JP-27 for Osaka, JP-14 for Kanagawa) |
| `propertyType` | String | No | - | Filter by type: `mansion-apartment`, `house`, `office`, `landonly` |
| `minPrice` | Integer | No | - | Minimum price in Japanese Yen |
| `maxPrice` | Integer | No | - | Maximum price in Japanese Yen |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to collect |
| `max_pages` | Integer | No | `10` | Safety cap on search result pages |
| `proxyConfiguration` | Object | No | Residential | Apify Proxy settings |

---

## Output Data

Each item in the dataset contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique property identifier |
| `title` | String | Property type and layout (e.g. 2LDK Apartment) |
| `propertyType` | String | Type of property |
| `location` | String | Property address and area |
| `price` | Number | Price in Japanese Yen |
| `priceFormatted` | String | Formatted price with Yen symbol |
| `station` | String | Nearest station and walking distance |
| `size` | String | Property size in square meters |
| `floors` | String | Floor information |
| `imageUrl` | String | Property image URL |
| `url` | String | Link to property detail page |
| `agentLogo` | String | Real estate agent logo URL |

---

## Usage Examples

### Basic Search

Extract property listings in Tokyo:

```json
{
    "location": "JP-13",
    "results_wanted": 50,
    "max_pages": 5
}
```

### Filtered Search

Search for apartments under 50 million yen in Osaka:

```json
{
    "location": "JP-27",
    "propertyType": "mansion-apartment",
    "maxPrice": 50000000,
    "results_wanted": 30
}
```

### Custom URL

Use a specific search URL with advanced filters:

```json
{
    "startUrl": "https://realestate.co.jp/en/forsale/listing?prefecture=JP-13&building_type=house&max_price=100000000&order=price_ranking-asc",
    "results_wanted": 20
}
```

### Nationwide Search

Search all properties across Japan:

```json
{
    "minPrice": 10000000,
    "maxPrice": 50000000,
    "results_wanted": 100
}
```

---

## Sample Output

```json
{
    "id": "1379990",
    "title": "2SLDK House",
    "propertyType": "2SLDK House",
    "location": "Higashi, Shibuya-ku, Tokyo",
    "price": 188000000,
    "priceFormatted": "¥188,000,000",
    "station": "Ebisu Station (11 min. walk)",
    "size": "120.22 m²",
    "floors": "2F",
    "imageUrl": "https://media.realestate.co.jp/img/store/dd/2b/.../_w300.jpeg",
    "url": "https://realestate.co.jp/en/forsale/view/1379990",
    "agentLogo": "https://media.realestate.co.jp/img/store/25/a4/.../_w150.jpeg"
}
```

---

## Tips for Best Results

### Choose the Right Location

Start with a specific prefecture like Tokyo (JP-13) or Osaka (JP-27). Each prefecture has thousands of listings. Use nationwide search for smaller markets.

### Use Residential Proxies

Japan real estate sites may rate-limit requests. Enable residential proxies in proxy configuration for reliable results with larger result sets.

### Start Small for Testing

Begin with 10-20 results and 2-3 pages to verify data quality. Scale up once you confirm the output matches expectations.

### Filter Before Scraping

Use property type and price filters to narrow results. This reduces scrape time and focuses on relevant listings.

---

## Integrations

Connect your data with:

- **Google Sheets** - Export for market analysis
- **Airtable** - Build searchable property databases
- **Make** - Create automated workflows
- **Zapier** - Trigger actions on new listings

### Export Formats

Download data in multiple formats:

- **JSON** - For developers and APIs
- **CSV** - For spreadsheet analysis
- **Excel** - For business reporting

---

## Frequently Asked Questions

### How many properties can I collect?
You can collect all available listings matching your search criteria. The practical limit depends on the number of matching results and page limits.

### What prefecture codes should I use?
Use ISO 3166-2:JP codes like JP-13 (Tokyo), JP-27 (Osaka), JP-14 (Kanagawa), JP-23 (Aichi), JP-01 (Hokkaido). Leave empty for nationwide search.

### Can I scrape rental properties?
Yes. Use a startUrl pointing to the rent section: `https://realestate.co.jp/en/rent/listing` or use the equivalent rental search URL.

### Does this work with all realestate.co.jp URLs?
Yes. Any valid search URL from realestate.co.jp works, including `/en/forsale`, `/en/forsale/listing`, `/en/rent`, and search URLs with any filter parameters.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/schedules)

---

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring compliance with website terms of service and applicable laws. Use data responsibly and respect rate limits.
