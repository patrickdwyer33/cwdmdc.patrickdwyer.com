import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { groupByCounty } from './data.js';

export async function createMap(selector) {
    const container = d3.select(selector);

    // Set up responsive dimensions based on container
    const containerWidth = container.node().getBoundingClientRect().width;
    const aspectRatio = 4/3; // width:height ratio
    const width = containerWidth;
    const height = width / aspectRatio;

    const svg = container
        .append('svg')
        .attr('width', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .style('background', '#f8f9fa')
        .style('display', 'block');

    // Create tooltip
    const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'map-tooltip')
        .style('position', 'absolute')
        .style('visibility', 'hidden')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('color', 'white')
        .style('padding', '10px')
        .style('border-radius', '5px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('z-index', '1000');

    // Track selected county for toggling
    let selectedCounty = null;

    // Add background rectangle to capture clicks outside counties
    svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('click', function() {
            // Clear county filter when clicking background
            selectedCounty = null;
            d3.select('#county-filter').node().value = '';
            d3.select('#county-filter').dispatch('change');
        });

    // Load Missouri counties from US Atlas
    let moCounties = null;
    let countiesGroup = svg.append('g').attr('class', 'counties');

    try {
        // Fetch US counties TopoJSON
        const us = await d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');

        // Convert to GeoJSON and filter for Missouri (FIPS code 29)
        const counties = topojson.feature(us, us.objects.counties);
        moCounties = {
            type: 'FeatureCollection',
            features: counties.features.filter(d => d.id.toString().startsWith('29'))
        };

        console.log(`Loaded ${moCounties.features.length} Missouri counties`);

        // Calculate bounds for Missouri and set up projection
        const bounds = d3.geoBounds(moCounties);
        const centerX = (bounds[0][0] + bounds[1][0]) / 2;
        const centerY = (bounds[0][1] + bounds[1][1]) / 2;

        // Set up projection centered on Missouri
        const projection = d3.geoMercator()
            .center([centerX, centerY])
            .fitSize([width * 0.95, height * 0.95], moCounties);

        const path = d3.geoPath().projection(projection);

        // Draw counties
        countiesGroup.selectAll('path')
            .data(moCounties.features)
            .enter()
            .append('path')
            .attr('d', path)
            .attr('class', 'county')
            .attr('fill', '#e0e0e0')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer');

        // Draw state border (outline of Missouri)
        const stateBorder = topojson.mesh(us, us.objects.counties, (a, b) => {
            // Only draw borders between Missouri and non-Missouri counties (exterior borders)
            const aMO = a.id.toString().startsWith('29');
            const bMO = b ? b.id.toString().startsWith('29') : false;
            return aMO !== bMO;
        });

        svg.append('path')
            .datum(stateBorder)
            .attr('d', path)
            .attr('class', 'state-border')
            .attr('fill', 'none')
            .attr('stroke', '#333')
            .attr('stroke-width', 2.5)
            .attr('pointer-events', 'none');

    } catch (error) {
        console.error('Error loading Missouri counties:', error);

        // Show error message
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', '#dc3545')
            .text('Error loading map data. Please check console for details.');
    }

    // Track selected metric
    let selectedMetric = 'total';

    // Color scales for different metrics (matching stat card colors)
    const colorScales = {
        total: d3.scaleSequential().interpolator(d3.interpolateBlues),
        positive: d3.scaleSequential().interpolator(d3.interpolateReds),
        notDetected: d3.scaleSequential().interpolator(d3.interpolateGreens),
        pending: d3.scaleSequential().interpolator(d3.interpolateOranges),
        unsuitable: d3.scaleSequential().interpolator(d3.interpolateGreys)
    };

    // Metric labels for display
    const metricLabels = {
        total: 'Total Samples',
        positive: 'Positive',
        notDetected: 'Not Detected',
        pending: 'Pending',
        unsuitable: 'Unsuitable'
    };

    // Set up metric selector event listeners
    d3.selectAll('input[name="map-metric"]').on('change', function() {
        selectedMetric = this.value;
        // Re-render the map with the current data
        if (window.dashboard && window.dashboard.filteredData) {
            mapAPI.update(window.dashboard.filteredData);
        }
    });

    const mapAPI = {
        update(data) {
            if (!moCounties) {
                console.warn('Map data not loaded yet');
                return;
            }

            const countyData = groupByCounty(data);

            // Create a lookup map from county name to data
            const dataByCounty = new Map(countyData.map(d => [d.county.toLowerCase(), d]));

            // Get the current color scale and max value for selected metric
            const currentColorScale = colorScales[selectedMetric];

            // Determine max value based on selected metric
            let maxValue = 0;
            switch(selectedMetric) {
                case 'total':
                    maxValue = d3.max(countyData, d => d.count) || 0;
                    break;
                case 'positive':
                    maxValue = d3.max(countyData, d => d.positive) || 0;
                    break;
                case 'notDetected':
                    maxValue = d3.max(countyData, d => d.negative) || 0;
                    break;
                case 'pending':
                    maxValue = d3.max(countyData, d => d.pending) || 0;
                    break;
                case 'unsuitable':
                    maxValue = d3.max(countyData, d => d.unsuitable) || 0;
                    break;
            }

            currentColorScale.domain([0, maxValue]);

            // Update county colors and interactivity
            countiesGroup.selectAll('.county')
                .attr('fill', function(d) {
                    // Get county name from the feature properties
                    // US Atlas uses the "name" property for county names
                    const countyName = d.properties?.name?.toLowerCase();
                    const countyStats = dataByCounty.get(countyName);

                    if (countyStats && countyStats.count > 0) {
                        // Get the value for the selected metric
                        let value = 0;
                        switch(selectedMetric) {
                            case 'total':
                                value = countyStats.count;
                                break;
                            case 'positive':
                                value = countyStats.positive;
                                break;
                            case 'notDetected':
                                value = countyStats.negative;
                                break;
                            case 'pending':
                                value = countyStats.pending;
                                break;
                            case 'unsuitable':
                                value = countyStats.unsuitable;
                                break;
                        }
                        return currentColorScale(value);
                    }
                    return '#e0e0e0'; // Default gray for counties with no data
                })
                .on('mouseover', function(event, d) {
                    const countyName = d.properties?.name;
                    const countyStats = dataByCounty.get(countyName?.toLowerCase());

                    if (countyStats) {
                        tooltip
                            .style('visibility', 'visible')
                            .html(`
                                <strong>${countyName}</strong><br/>
                                Total Samples: ${countyStats.count}<br/>
                                Pending: ${countyStats.pending}<br/>
                                Positive: ${countyStats.positive}<br/>
                                Not Detected: ${countyStats.negative}
                            `);
                    } else {
                        tooltip
                            .style('visibility', 'visible')
                            .html(`
                                <strong>${countyName || 'Unknown'}</strong><br/>
                                No CWD samples
                            `);
                    }

                    // Bring county to front and highlight
                    d3.select(this)
                        .raise()
                        .attr('stroke', '#000')
                        .attr('stroke-width', 2);
                })
                .on('mousemove', function(event) {
                    tooltip
                        .style('top', (event.pageY - 10) + 'px')
                        .style('left', (event.pageX + 10) + 'px');
                })
                .on('mouseout', function() {
                    tooltip.style('visibility', 'hidden');

                    d3.select(this)
                        .attr('stroke', '#fff')
                        .attr('stroke-width', 1);
                })
                .on('click', function(event, d) {
                    event.stopPropagation(); // Prevent background click from firing

                    const countyName = d.properties?.name;
                    if (countyName) {
                        // Toggle: if clicking the same county, deselect it
                        if (selectedCounty === countyName) {
                            selectedCounty = null;
                            d3.select('#county-filter').node().value = '';
                        } else {
                            selectedCounty = countyName;
                            d3.select('#county-filter').node().value = countyName;
                        }
                        d3.select('#county-filter').dispatch('change');
                    }
                });

            // Update legend
            this.updateLegend(maxValue, currentColorScale, selectedMetric);
        },

        updateLegend(maxValue, colorScale, metric) {
            svg.selectAll('.legend').remove();
            svg.selectAll('defs').remove();

            const legendWidth = 200;
            const legendHeight = 20;

            const legend = svg.append('g')
                .attr('class', 'legend')
                .attr('transform', `translate(${width - legendWidth - 20}, 20)`);

            // Create gradient
            const defs = svg.append('defs');
            const gradient = defs.append('linearGradient')
                .attr('id', 'legend-gradient')
                .attr('x1', '0%')
                .attr('x2', '100%');

            gradient.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', colorScale(0));

            gradient.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', colorScale(maxValue));

            // Legend rectangle
            legend.append('rect')
                .attr('width', legendWidth)
                .attr('height', legendHeight)
                .style('fill', 'url(#legend-gradient)')
                .style('stroke', '#333');

            // Legend labels
            legend.append('text')
                .attr('x', 0)
                .attr('y', legendHeight + 15)
                .style('font-size', '12px')
                .text('0');

            legend.append('text')
                .attr('x', legendWidth)
                .attr('y', legendHeight + 15)
                .attr('text-anchor', 'end')
                .style('font-size', '12px')
                .text(maxValue);

            legend.append('text')
                .attr('x', legendWidth / 2)
                .attr('y', -5)
                .attr('text-anchor', 'middle')
                .style('font-size', '12px')
                .style('font-weight', 'bold')
                .text(metricLabels[metric]);
        }
    };

    return mapAPI;
}