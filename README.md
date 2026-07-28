## What does RealEstate.co.jp Scraper do?

Extract property listings from RealEstate.co.jp, Japan's leading international real estate platform for for-sale and rental properties. Enter a prefecture code, search URL, or filter by property type and price range to collect structured data including prices, sizes, layouts, station access, gallery images, floor plans, and agent details. The output works for market research, investment analysis, portfolio monitoring, and lead generation workflows.

## Why use RealEstate.co.jp Scraper?

- **Complete Japan property data** - Collect for-sale and rental listings across all 47 Japanese prefectures with one tool.
- **Rich detail enrichment** - Optionally visit each property page to extract gallery images, floor plans, construction year, structure, land rights, zoning, occupancy status, and agent contacts.
- **Automation-ready output** - Export results as JSON, CSV, Excel, or XML and connect to Google Sheets, webhooks, or API workflows.
- **Flexible input options** - Use a prefecture code, a full RealEstate.co.jp search URL with advanced filters, or build a query from individual parameters.

## What data can you extract from RealEstate.co.jp?

| Field | Description |
|-------|-------------|
| `title` | Property type and layout (e.g. 2LDK Apartment, 3SLDK House) |
| `location` | Address and area of the property |
| `price` | Price in Japanese Yen |
| `size` | Property size in square meters |
| `station` | Nearest station name and walking distance |
| `galleryImages` | Full gallery of high-resolution property images |
| `floorPlanImage` | Floor plan image URL when available |
| `yearBuilt` | Construction year of the building |
| `structure` | Building structure type (e.g. Reinforced Concrete, Steel) |
| `landRights` | Land rights or ownership type |
| `agentName` | Real estate agent or agency name |

## How to use RealEstate.co.jp Scraper

1. Open the Actor on Apify Store.
2. Enter a prefecture code (e.g. JP-13 for Tokyo) or paste a RealEstate.co.jp search URL.
3. Set the maximum number of results and optional price or property type filters.
4. Keep detail enrichment enabled for gallery images, floor plans, and construction details.
5. Run the Actor.
6. Download the dataset or connect it to your workflow through integrations.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | - | Full RealEstate.co.jp search URL. Overrides other filter parameters when provided. |
| `location` | String | No | `JP-13` | Japanese prefecture code such as JP-13 (Tokyo), JP-27 (Osaka), JP-14 (Kanagawa). Leave empty for nationwide search. |
| `propertyType` | String | No | - | Filter by property type: `mansion-apartment`, `house`, `office`, `hotel`, `landonly`, `terrace_house`, `town_house` |
| `minPrice` | Integer | No | - | Minimum price in Japanese Yen |
| `maxPrice` | Integer | No | - | Maximum price in Japanese Yen |
| `results_wanted` | Integer | No | `20` | Maximum number of property listings to collect |
| `max_pages` | Integer | No | `10` | Safety cap on search result pages visited |
| `withDetail` | Boolean | No | `true` | Visit each property page to enrich results with gallery images, floor plan, construction year, structure, land rights, and agent name. Adds about one second per property. |
| `proxyConfiguration` | Object | No | - | Apify Proxy settings. Residential proxies are recommended for Japan-targeted collection. |

## Output Data

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique property identifier from RealEstate.co.jp |
| `title` | String | Property type and layout description |
| `propertyType` | String | Type of property (e.g. mansion-apartment, house) |
| `location` | String | Property address and neighborhood |
| `price` | Number | List price in Japanese Yen |
| `priceFormatted` | String | Formatted price with Yen symbol |
| `station` | String | Nearest train station and walking time |
| `size` | String | Property size in square meters |
| `floors` | String | Floor level information |
| `imageUrl` | String | Primary listing image URL |
| `url` | String | Direct link to the property detail page |
| `agentLogo` | String | Real estate agent logo image URL |
| `galleryImages` | Array | Full set of high-resolution property image URLs. Available when `withDetail` is enabled. |
| `floorPlanImage` | String | Floor plan image URL. Available when `withDetail` is enabled. |
| `buildingName` | String | Building or complex name when available |
| `description` | String | Property description text from structured data |
| `datePosted` | String | ISO date the listing was posted |
| `agentName` | String | Real estate agent or agency name |
| `yearBuilt` | String | Year of construction |
| `structure` | String | Building structure material or type |
| `landRights` | String | Land rights category (e.g. Freehold, Leasehold) |
| `zoning` | String | Zoning classification |
| `directionFacing` | String | Cardinal direction the property faces |
| `occupancy` | String | Occupancy status |

## Usage Examples

### Basic Prefecture Search

Collect property listings in Tokyo with default settings:

```json
{
    "location": "JP-13",
    "results_wanted": 50,
    "max_pages": 5
}
```

### Filtered Apartment Search

Search for apartments under 50 million yen in Osaka with detail enrichment disabled for faster results:

```json
{
    "location": "JP-27",
    "propertyType": "mansion-apartment",
    "maxPrice": 50000000,
    "results_wanted": 30,
    "withDetail": false
}
```

### Custom Search URL

Use a URL with pre-applied filters from RealEstate.co.jp for precise targeting:

```json
{
    "startUrl": "https://realestate.co.jp/en/forsale/listing?prefecture=JP-13&building_type=house&max_price=100000000&order=price_ranking-asc",
    "results_wanted": 20
}
```

### Nationwide Search with Detail Enrichment

Search all properties across Japan between 10 and 50 million Yen with full detail enrichment:

```json
{
    "minPrice": 10000000,
    "maxPrice": 50000000,
    "results_wanted": 100,
    "withDetail": true
}
```

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
    "size": "120.22 m\u00b2",
    "floors": "2F",
    "imageUrl": "https://media.realestate.co.jp/img/store/dd/2b/.../_w300.jpeg",
    "url": "https://realestate.co.jp/en/forsale/view/1379990",
    "agentLogo": "https://media.realestate.co.jp/img/store/25/a4/.../_w150.jpeg",
    "galleryImages": [
        "https://media.realestate.co.jp/img/store/dd/2b/.../01.jpeg",
        "https://media.realestate.co.jp/img/store/dd/2b/.../02.jpeg",
        "https://media.realestate.co.jp/img/store/dd/2b/.../03.jpeg"
    ],
    "floorPlanImage": "https://media.realestate.co.jp/img/store/dd/2b/.../floorplan.jpeg",
    "buildingName": "Example Building Name",
    "description": "A spacious 2SLDK house located in the Higashi area of Shibuya-ku...",
    "datePosted": "2026-07-20",
    "agentName": "Example Real Estate Agent",
    "yearBuilt": "2018",
    "structure": "Reinforced Concrete",
    "landRights": "Freehold",
    "zoning": "Commercial",
    "directionFacing": "South",
    "occupancy": "Vacant"
}
```

## Tips for Best Results

- Start with a specific prefecture like Tokyo (JP-13) or Osaka (JP-27) rather than a nationwide search for faster initial runs.
- Keep `withDetail` enabled (default) when you need gallery images, floor plans, construction year, and agent details. Disable it for faster bulk collection when only list-level data is sufficient.
- Test with 10-20 results first to confirm the output matches your expectations before scaling up.
- Use a custom `startUrl` when you want to apply complex filters (multiple property types, custom sort order, keyword search) available on RealEstate.co.jp.
- For rental properties, point `startUrl` to the rental section: `https://realestate.co.jp/en/rent/listing`.
- Some fields like `yearBuilt`, `structure`, and `landRights` may be empty when the source page does not publish that information.

## Integrations

- **Google Sheets** - Send property data to spreadsheets for analysis and reporting.
- **Webhooks** - Trigger downstream workflows after each run completes.
- **Make or Zapier** - Connect results to no-code automations without writing code.
- **API** - Access datasets programmatically from your own applications.

## Frequently Asked Questions

### What prefecture codes should I use?

Use ISO 3166-2:JP codes. Common codes include JP-13 (Tokyo), JP-27 (Osaka), JP-14 (Kanagawa), JP-23 (Aichi), JP-01 (Hokkaido), JP-28 (Hyogo), and JP-40 (Fukuoka). Leave the field empty for a nationwide search.

### Can I scrape rental properties?

Yes. Set the `startUrl` to a RealEstate.co.jp rental search URL such as `https://realestate.co.jp/en/rent/listing` or any rental search URL with filters applied.

### How many properties can I collect in one run?

You can collect all available listings matching your search criteria. The practical limit depends on matching inventory and the page cap. Use `results_wanted` to control output size and `max_pages` as a safety limit.

### What is the withDetail option?

When enabled, the Actor visits each property detail page to collect additional data: gallery images, floor plan images, construction year, building structure, land rights, zoning, direction facing, occupancy status, agent name, and the full property description. Disable it for faster runs when you only need list-level data like price, location, and station access.

### Can I export the data to CSV or Excel?

Yes. Apify datasets can be downloaded in CSV, Excel, JSON, XML, HTML, and other formats from the Apify Console.

### Can I run this Actor on a schedule?

Yes. Schedule the Actor in Apify Console to refresh property data hourly, daily, weekly, or at any custom interval.

### Is it legal to scrape RealEstate.co.jp?

Scraping publicly available web data can be legal, but you are responsible for complying with applicable laws, website terms of service, and privacy regulations. Use the data responsibly.

## Related Actors

- [Realtor.com Scraper](https://apify.com/shahidirfan/realtor-com-scraper) - Extract for-sale property listings from Realtor.com for US market analysis.
- [StreetEasy Scraper](https://apify.com/shahidirfan/streeteasy-scraper) - Collect NYC property listings from StreetEasy for sales and rentals.
- [Rent.com Scraper](https://apify.com/shahidirfan/rent-com-scraper) - Extract rental property data from Rent.com across the United States.
- [Domain.com.au Property Scraper](https://apify.com/shahidirfan/domain-com-au-property-scraper) - Gather Australian real estate listings from Domain.com.au.

## Support

For issues, feature requests, or custom Actor development, use the Issues tab on the Actor page or contact the developer through Apify.

## Legal Notice

This Actor is designed for legitimate data collection from publicly available sources on RealEstate.co.jp. Users are responsible for using the data responsibly and complying with applicable laws and website terms.