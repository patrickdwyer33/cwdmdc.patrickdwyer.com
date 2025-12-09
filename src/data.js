import * as d3 from 'd3';

const API_BASE_URL = 'https://gisblue.mdc.mo.gov/arcgis/rest/services/Terrestrial/CWD_Fall_Reporting_Dashboard/MapServer/26/query';

export async function loadData() {
    try {
        // Try to fetch all records from API with pagination
        const allFeatures = await fetchAllRecords();

        if (allFeatures && allFeatures.length > 0) {
            console.log(`✓ Loaded ${allFeatures.length} total records from API`);
            return allFeatures;
        } else {
            throw new Error('No features found in API response');
        }
    } catch (error) {
        console.warn('Failed to load from API, falling back to local data:', error);

        // Fallback to local data file
        try {
            const localData = await d3.json('/output-data.json');
            if (localData.features && localData.features.length > 0) {
                return localData.features.map(feature => feature.attributes);
            } else {
                throw new Error('No features found in local data');
            }
        } catch (localError) {
            console.error('Failed to load local data:', localError);
            throw new Error('Failed to load data from both API and local file');
        }
    }
}

async function fetchAllRecords() {
    let allFeatures = [];
    let offset = 0;
    const batchSize = 2000; // Maximum records per request for ArcGIS
    let hasMore = true;

    while (hasMore) {
        const url = `${API_BASE_URL}?f=json&where=1%3D1&outFields=*&resultOffset=${offset}&resultRecordCount=${batchSize}`;

        console.log(`Fetching records ${offset} to ${offset + batchSize}...`);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.features && data.features.length > 0) {
                // Extract attributes from features
                const features = data.features.map(feature => feature.attributes);
                allFeatures = allFeatures.concat(features);

                console.log(`  → Fetched ${features.length} records (total so far: ${allFeatures.length})`);

                // Check if there are more records
                // ArcGIS returns exceededTransferLimit: true when there are more records
                // OR if we got a full batch, there might be more
                if (data.exceededTransferLimit || features.length === batchSize) {
                    offset += batchSize;
                } else {
                    // Got fewer records than requested, we're done
                    hasMore = false;
                }
            } else {
                // No features in this batch, we're done
                hasMore = false;
            }
        } catch (error) {
            console.error(`Error fetching batch at offset ${offset}:`, error);
            // If we have some data, return it; otherwise throw
            if (allFeatures.length > 0) {
                console.warn(`Returning partial data: ${allFeatures.length} records`);
                hasMore = false;
            } else {
                throw error;
            }
        }
    }

    return allFeatures;
}

export function processData(rawData, deduplicate = true) {
    if (!rawData || !Array.isArray(rawData)) {
        console.error('Invalid data provided to processData');
        return [];
    }

    const currentYear = new Date().getFullYear();

    const processed = rawData.map(d => {
        try {
            return {
                objectId: d.OBJECTID,
                permitYear: d.PERMITYEAR,
                collectionType: d.Collection_Type,
                collectionTypeName: getCollectionTypeName(d.Collection_Type),
                result: normalizeResult(d.RESULT),
                collectionDate: parseDate(d.CollectionDate),
                harvestDate: parseHarvestDate(d.HARVEST_DATE),
                sampleType: d.SampleType,
                deerSex: d.Deer_Sex,
                deerSexName: getDeerSexName(d.Deer_Sex),
                deerAge: d.Deer_Age,
                deerAgeName: getDeerAgeName(d.Deer_Age),
                county: d.County,
                countyName: d.CountyName,
                coreArea: d.CoreArea,
                township: d.Township,
                range: d.Range,
                townshipRange: d.TownshipRange,
                section: d.Section,
                gisLabel: d.GISlabel,
                nonMDC: d.Non_MDC === 1,
                mobileApp: d.MobileApp,
                specimenNo: d.Specimen_No,
                publish: d.Publish === 'Y',
                telecheckId: d.TelecheckID
            };
        } catch (error) {
            console.warn('Error processing data row:', error, d);
            return null;
        }
    }).filter(d => d !== null && d.permitYear <= currentYear);

    if (deduplicate) {
        // Deduplicate by specimen number, keeping the record with the latest collection date
        const deduped = deduplicateBySpecimen(processed);
        console.log(`Processed ${rawData.length} records, deduplicated to ${deduped.length} (removed ${processed.length - deduped.length} duplicates)`);
        return deduped;
    } else {
        console.log(`Processed ${rawData.length} records (no deduplication)`);
        return processed;
    }
}

function deduplicateBySpecimen(data) {
    // Group by specimen number
    const grouped = new Map();

    data.forEach(record => {
        const specimenNo = record.specimenNo;

        if (!specimenNo) {
            // Skip records without specimen numbers
            // Uncomment below to keep records without specimen numbers:
            // grouped.set(`no-specimen-${record.objectId}`, record);
            return;
        }

        const existing = grouped.get(specimenNo);

        if (!existing) {
            grouped.set(specimenNo, record);
        } else {
            // Keep the one with the latest collection date
            const existingDate = existing.collectionDate ? existing.collectionDate.getTime() : 0;
            const currentDate = record.collectionDate ? record.collectionDate.getTime() : 0;

            if (currentDate > existingDate) {
                grouped.set(specimenNo, record);
            }
        }
    });

    return Array.from(grouped.values());
}

function getCollectionTypeName(type) {
    switch (type) {
        case '1': return 'Hunter Harvest';
        case '2': return 'Surveillance';
        default: return 'Unknown';
    }
}

function normalizeResult(result) {
    if (!result) return 'Unknown';

    const normalized = result.trim();

    // Normalize specific values
    if (normalized.toLowerCase() === 'sample unsuitable') {
        return 'Sample Unsuitable';
    }

    if (normalized.toLowerCase() === 'not detected') {
        return 'Negative';
    }

    // Return the result as-is for other values
    return normalized;
}

function getDeerSexName(sex) {
    switch (sex) {
        case 'M': return 'Male';
        case 'F': return 'Female';
        default: return 'Unknown';
    }
}

function getDeerAgeName(age) {
    switch (age) {
        case 'A': return 'Adult';
        case 'Y': return 'Young';
        case 'F': return 'Fawn';
        case 'U': return 'Unknown';
        default: return 'Unknown';
    }
}

function parseDate(dateString) {
    if (!dateString) return null;

    // Handle YYYYMMDD format
    if (typeof dateString === 'string' && dateString.length === 8) {
        const year = dateString.substring(0, 4);
        const month = dateString.substring(4, 6);
        const day = dateString.substring(6, 8);
        return new Date(year, month - 1, day);
    }

    return null;
}

function parseHarvestDate(dateString) {
    if (!dateString) return null;

    // Handle MM/DD/YYYY format
    if (typeof dateString === 'string' && dateString.includes('/')) {
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    }

    return null;
}

export function groupByCounty(data) {
    const grouped = d3.group(data, d => d.countyName);

    return Array.from(grouped, ([county, samples]) => ({
        county,
        count: samples.length,
        pending: samples.filter(d => d.result === 'Pending').length,
        positive: samples.filter(d => d.result === 'Positive').length,
        negative: samples.filter(d => d.result === 'Negative').length,
        unsuitable: samples.filter(d => d.result === 'Sample Unsuitable').length,
        samples
    })).filter(d => d.county); // Remove entries without county names
}