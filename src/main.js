import * as d3 from 'd3';
import { loadData, processData } from './data.js';
import { createMap } from './map.js';
import { createTable } from './table.js';
import { updateStats } from './stats.js';
import './style.css';

class CWDDashboard {
    constructor() {
        this.rawData = null;
        this.allData = null; // All processed records (no deduplication)
        this.deduplicatedData = null; // Deduplicated records
        this.filteredData = null;
        this.map = null;
        this.table = null;
        this.filters = {
            year: '',
            county: '',
            result: '',
            deduplicate: true
        };

        this.init();
    }

    async init() {
        try {
            this.showLoading(true);

            // Load and process data
            this.rawData = await loadData();
            this.allData = processData(this.rawData, false); // Process without deduplication
            this.deduplicatedData = processData(this.rawData, true); // Process with deduplication

            console.log(`Loaded ${this.allData.length} total CWD samples (${this.deduplicatedData.length} after deduplication)`);

            // Initialize components
            await this.initializeComponents();

            // Set up event listeners
            this.setupEventListeners();

            // Initial render
            this.updateAll();

            this.showLoading(false);

        } catch (error) {
            console.error('Error initializing dashboard:', error);
            this.showError('Failed to load CWD data. Please try refreshing the page.');
        }
    }

    async initializeComponents() {
        // Initialize map
        this.map = await createMap('#map');

        // Initialize table
        this.table = createTable('#data-table');

        // Populate filter options
        this.populateFilters();
    }

    populateFilters() {
        // Use all data for populating filter options
        const dataForFilters = this.allData;

        // Populate year filter
        const years = [...new Set(dataForFilters.map(d => d.permitYear))].sort();
        const yearSelect = d3.select('#year-filter');
        yearSelect.selectAll('option:not(:first-child)').remove();
        yearSelect.selectAll('option.year-option')
            .data(years)
            .enter()
            .append('option')
            .classed('year-option', true)
            .attr('value', d => d)
            .text(d => d);

        // Populate county filter
        const counties = [...new Set(dataForFilters.map(d => d.countyName))]
            .filter(d => d)
            .sort();
        const countySelect = d3.select('#county-filter');
        countySelect.selectAll('option:not(:first-child)').remove();
        countySelect.selectAll('option.county-option')
            .data(counties)
            .enter()
            .append('option')
            .classed('county-option', true)
            .attr('value', d => d)
            .text(d => d);
    }

    setupEventListeners() {
        // Filter change events
        d3.select('#year-filter').on('change', () => {
            this.filters.year = d3.select('#year-filter').node().value;
            this.updateAll();
        });

        d3.select('#county-filter').on('change', () => {
            this.filters.county = d3.select('#county-filter').node().value;
            this.updateAll();
        });

        d3.select('#result-filter').on('change', () => {
            this.filters.result = d3.select('#result-filter').node().value;
            this.updateAll();
        });

        d3.select('#dedupe-filter').on('change', () => {
            const value = d3.select('#dedupe-filter').node().value;
            this.filters.deduplicate = value === 'deduplicated';
            this.updateAll();
        });

        // Table search
        d3.select('#table-search').on('input', () => {
            const searchTerm = d3.select('#table-search').node().value;
            this.table.search(searchTerm);
        });
    }

    applyFilters() {
        // Start with either deduplicated or all data based on filter setting
        const sourceData = this.filters.deduplicate ? this.deduplicatedData : this.allData;

        // Apply filters
        this.filteredData = sourceData.filter(d => {
            if (this.filters.year && d.permitYear !== this.filters.year) {
                return false;
            }
            if (this.filters.county && d.countyName !== this.filters.county) {
                return false;
            }
            if (this.filters.result && d.result !== this.filters.result) {
                return false;
            }
            return true;
        });
    }

    updateAll() {
        this.applyFilters();

        // Update components
        this.map.update(this.filteredData);
        this.table.update(this.filteredData);
        updateStats(this.filteredData);

        // Update table count
        d3.select('#table-count').text(`${this.filteredData.length} samples`);
    }

    showLoading(show) {
        d3.select('#loading').style('display', show ? 'flex' : 'none');
    }

    showError(message) {
        this.showLoading(false);
        // You could implement a proper error modal here
        alert(message);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new CWDDashboard();
});