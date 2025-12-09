import * as d3 from 'd3';

const API_BASE_URL = 'https://gisblue.mdc.mo.gov/arcgis/rest/services/Terrestrial/CWD_Fall_Reporting_Dashboard/MapServer/26/query';

export async function loadData(progressCallback = null) {
    try {
        // Try to fetch all records from API with pagination
        const allFeatures = await fetchAllRecords(progressCallback);

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

class BatchFetchManager {
    constructor(apiUrl, batchSize = 2000, maxConcurrent = 4) {
        this.apiUrl = apiUrl;
        this.batchSize = batchSize;
        this.maxConcurrent = maxConcurrent;
        this.completed = new Map(); // offset -> batch data
        this.inFlight = new Map(); // offset -> Promise
        this.failed = new Set(); // offsets that failed after retries
        this.nextFetchOffset = 0; // Next offset to fetch
        this.nextAggregateOffset = 0; // Next offset to aggregate
        this.hasMore = true;
        this.totalFetched = 0;
    }

    async fetchBatch(offset, retries = 3) {
        const url = `${this.apiUrl}?f=json&where=1%3D1&outFields=*&resultOffset=${offset}&resultRecordCount=${this.batchSize}`;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                // Add 30s timeout using AbortController
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status}`);
                }

                const data = await response.json();

                if (data.features && data.features.length > 0) {
                    const features = data.features.map(feature => feature.attributes);
                    return {
                        features,
                        exceededTransferLimit: data.exceededTransferLimit || features.length === this.batchSize
                    };
                } else {
                    return {
                        features: [],
                        exceededTransferLimit: false
                    };
                }
            } catch (error) {
                if (attempt < retries) {
                    // Exponential backoff: 1s, 2s, 4s
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`Batch at offset ${offset} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`Batch at offset ${offset} failed after ${retries + 1} attempts:`, error);
                    throw error;
                }
            }
        }
    }

    async fetchAllBatches(progressCallback = null) {
        const allFeatures = [];

        console.log('Starting parallel batch fetching...');

        while (this.hasMore || this.inFlight.size > 0) {
            // Start new fetches up to maxConcurrent limit
            while (this.hasMore && this.inFlight.size < this.maxConcurrent) {
                const offset = this.nextFetchOffset;
                console.log(`Starting fetch for offset ${offset} (${this.inFlight.size + 1}/${this.maxConcurrent} concurrent)`);

                const promise = this.fetchBatch(offset)
                    .then(result => {
                        this.completed.set(offset, result);
                        this.inFlight.delete(offset);
                        this.totalFetched += result.features.length;

                        console.log(`  ✓ Fetched ${result.features.length} records at offset ${offset} (total: ${this.totalFetched})`);

                        return result;
                    })
                    .catch(() => {
                        this.failed.add(offset);
                        this.inFlight.delete(offset);
                        console.error(`  ✗ Failed to fetch batch at offset ${offset}`);
                        return null;
                    });

                this.inFlight.set(offset, promise);
                this.nextFetchOffset += this.batchSize;
            }

            // Wait for at least one request to complete
            if (this.inFlight.size > 0) {
                await Promise.race(Array.from(this.inFlight.values()));
            }

            // Aggregate completed batches in sequential order
            while (this.completed.has(this.nextAggregateOffset)) {
                const batch = this.completed.get(this.nextAggregateOffset);
                this.completed.delete(this.nextAggregateOffset);
                allFeatures.push(...batch.features);

                // Only set hasMore = false when we've aggregated a batch with no more data
                if (!batch.exceededTransferLimit) {
                    this.hasMore = false;
                    console.log(`  → Reached end of data at offset ${this.nextAggregateOffset}`);
                }

                this.nextAggregateOffset += this.batchSize;
            }

            // Report progress
            if (progressCallback && allFeatures.length > 0) {
                const estimatedTotal = this.hasMore
                    ? Math.max(this.totalFetched, this.nextFetchOffset)
                    : this.totalFetched;
                const percent = this.hasMore
                    ? Math.min(Math.round((allFeatures.length / estimatedTotal) * 100), 99)
                    : 100;

                progressCallback({
                    loaded: allFeatures.length,
                    estimatedTotal,
                    percent
                });
            }
        }

        // Check if we have any data
        if (allFeatures.length === 0 && this.failed.size > 0) {
            throw new Error('Failed to fetch any batches');
        }

        if (this.failed.size > 0) {
            console.warn(`Completed with ${this.failed.size} failed batches. Returning ${allFeatures.length} records.`);
        } else {
            console.log(`✓ Successfully fetched all ${allFeatures.length} records using parallel batching`);
        }

        return allFeatures;
    }
}

async function fetchAllRecords(progressCallback = null) {
    const manager = new BatchFetchManager(API_BASE_URL, 2000, 4);
    return await manager.fetchAllBatches(progressCallback);
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
        return 'Unfit';
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
        unsuitable: samples.filter(d => d.result === 'Unfit').length,
        samples
    })).filter(d => d.county); // Remove entries without county names
}