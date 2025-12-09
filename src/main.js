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

            // Initialize metric selection
            this.initializeMetricSelection();

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
        // Populate year filter
        const years = [...new Set(this.allData.map(d => d.permitYear))].sort();
        const yearSelect = d3.select('#year-filter');
        yearSelect.selectAll('option:not(:first-child)').remove();
        yearSelect.selectAll('option.year-option')
            .data(years)
            .enter()
            .append('option')
            .classed('year-option', true)
            .attr('value', d => d)
            .text(d => d);
    }

    setupEventListeners() {
        // Filter change events
        d3.select('#year-filter').on('change', () => {
            this.filters.year = d3.select('#year-filter').node().value;
            this.updateAll();
        });


        d3.select('#dedupe-filter').on('change', () => {
            const value = d3.select('#dedupe-filter').node().value;
            this.filters.deduplicate = value === 'deduplicated';
            this.updateAll();
        });

        // Stat card click events to change map metric
        d3.selectAll('.stat-card').on('click', (event) => {
            const metric = event.currentTarget.getAttribute('data-metric');

            // Update selected state
            d3.selectAll('.stat-card').classed('selected', false);
            d3.select(event.currentTarget).classed('selected', true);

            // Trigger map update with new metric
            if (this.map && this.map.setMetric) {
                this.map.setMetric(metric);
            }
        });
    }

    applyFilters() {
        // Start with either deduplicated or all data based on filter setting
        const sourceData = this.filters.deduplicate ? this.deduplicatedData : this.allData;

        // Apply year filter only
        this.filteredData = sourceData.filter(d => {
            if (this.filters.year && d.permitYear !== this.filters.year) {
                return false;
            }
            return true;
        });
    }

    updateAll() {
        this.applyFilters();

        // Create stats data filtered only by year (not county)
        const sourceData = this.filters.deduplicate ? this.deduplicatedData : this.allData;
        const statsData = sourceData.filter(d => {
            if (this.filters.year && d.permitYear !== this.filters.year) {
                return false;
            }
            return true;
        });

        // Update components
        this.map.update(this.filteredData);
        this.table.update(this.filteredData);
        updateStats(statsData);

        // Update table count
        d3.select('#table-count').text(`${this.filteredData.length} samples`);
    }

    initializeMetricSelection() {
        // Set initial selected state for Positive
        d3.select('.stat-card[data-metric="positive"]').classed('selected', true);
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