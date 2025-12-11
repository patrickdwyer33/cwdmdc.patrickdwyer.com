# CWD MDC Dashboard

A web application dashboard for visualizing Missouri Department of Conservation (MDC) Chronic Wasting Disease (CWD) surveillance data across all Missouri counties.

## Overview

This interactive dashboard provides comprehensive visualization of CWD testing data from deer samples collected throughout Missouri. Users can explore sampling results through both an interactive map interface and tabular data views, allowing analysis by individual counties or statewide aggregations.

## Features

- **Interactive Map**: Visualize CWD testing locations and results across Missouri counties
- **Tabular Data Views**: Browse detailed sampling data with filtering and sorting capabilities
- **County-Level Analysis**: Examine CWD surveillance data for specific counties
- **Statewide Overview**: View aggregate statistics and trends across Missouri
- **Real-time Data**: Connected to live MDC CWD surveillance database

## Data Source

The dashboard consumes data from the MDC CWD Fall Reporting Dashboard ArcGIS REST service:

```
https://gisblue.mdc.mo.gov/arcgis/rest/services/Terrestrial/CWD_Fall_Reporting_Dashboard/MapServer/26
```

The dashboard created by MDC can be found [here](https://mdc.mo.gov/hunting-trapping/species/deer/chronic-wasting-disease/cwd-sampling-results)

## Tech Stack

This webapp uses HTML, CSS, JS, and D3.js.

## Development

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager

### Installation (Getting Started)

1. Clone the repository:
```bash
git clone <repository-url>
cd cwd-mdc-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

### Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## API Reference

The application queries the MDC ArcGIS REST service with the following parameters:

- **Format**: JSON (`f=json`)
- **Query**: All records (`where=1%3D1`)
- **Fields**: All available fields (`outFields=*`)
- **resultOffset**: Used to get all data via pagination (API only returns at most 2000 records at a time)
- **resultRecordCount**: Set to 2000 trivially

See `query.txt` for the complete API endpoint URL.

If the query returns less than **resultRecordCount** records, then you know you have reached the last page of data.

### Raw Data Processing Notes

- Collection dates are stored in YYYYMMDD format
- Harvest dates use MM/DD/YYYY format when present
- Periods are excluded from county names
- Not all samples have complete location data

### Sample Data Structure

```json
{
  "OBJECTID": 1,
  "PERMITYEAR": "2024",
  "Collection_Type": "2",
  "RESULT": "Pending",
  "CollectionDate": "20250522",
  "HARVEST_DATE": null,
  "SampleType": "RPLN",
  "Deer_Sex": "F",
  "Deer_Age": "A",
  "County": "049",
  "CountyName": "Jasper",
  "Township": null,
  "Range": null,
  "Section": null,
  "Non_MDC": 0,
  "Specimen_No": 20272083,
  "Publish": "Y",
  "TelecheckID": null
}
```

## Contact

Patrick Dwyer
patrick@patrickdwyer.com
(312) 841-0148

This project does not have a license. Please contact me if you'd like to create derivative work.

---

*This project supports the Missouri Department of Conservation's efforts to monitor and track Chronic Wasting Disease in the state's deer population.*