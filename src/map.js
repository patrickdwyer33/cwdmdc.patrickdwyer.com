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

    // Track sticky tooltips and drag state
    const stickyTooltips = new Map(); // countyName -> {tooltip, line}
    let isDragging = false;

    // Load Missouri counties from US Atlas
    let moCounties = null;
    let path = null;
    let countiesGroup = svg.append('g').attr('class', 'counties');
    let linesGroup = svg.append('g').attr('class', 'connection-lines');

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

        path = d3.geoPath().projection(projection);

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
    let selectedMetric = 'positive';

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
        notDetected: 'Negative',
        pending: 'Pending',
        unsuitable: 'Unsuitable'
    };

    // Helper function to normalize county names for matching
    const normalizeCountyName = (name) => {
        if (!name) return '';
        return name.toLowerCase().replace(/\./g, '');
    };

    const mapAPI = {
        update(data) {
            if (!moCounties) {
                console.warn('Map data not loaded yet');
                return;
            }

            const countyData = groupByCounty(data);

            // Create a lookup map from county name to data (normalize names by removing periods)
            const dataByCounty = new Map(countyData.map(d => [normalizeCountyName(d.county), d]));

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
                    const countyName = d.properties?.name;
                    const countyStats = dataByCounty.get(normalizeCountyName(countyName));

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
                    if (isDragging) return; // Don't show hover tooltip while dragging

                    const countyName = d.properties?.name;
                    const countyStats = dataByCounty.get(normalizeCountyName(countyName));

                    if (countyStats) {
                        tooltip
                            .style('visibility', 'visible')
                            .html(`
                                <strong>${countyName}</strong><br/>
                                Total Samples: ${countyStats.count}<br/>
                                Pending: ${countyStats.pending}<br/>
                                Positive: ${countyStats.positive}<br/>
                                Negative: ${countyStats.negative}<br/>
                                Unsuitable: ${countyStats.unsuitable}
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
                    event.stopPropagation();

                    const countyName = d.properties?.name;
                    if (!countyName) return;

                    // Toggle sticky tooltip
                    if (stickyTooltips.has(countyName)) {
                        // Remove existing sticky tooltip and line
                        const {tooltip: existingTooltip, line: existingLine} = stickyTooltips.get(countyName);
                        existingTooltip.remove();
                        existingLine.remove();
                        stickyTooltips.delete(countyName);
                    } else {
                        // Create new sticky tooltip
                        const countyStats = dataByCounty.get(normalizeCountyName(countyName));
                        if (!countyStats) return;

                        // Calculate county centroid in SVG coordinates
                        const centroid = path.centroid(d);

                        const stickyTooltip = d3.select('body')
                            .append('div')
                            .attr('class', 'sticky-tooltip')
                            .style('position', 'absolute')
                            .style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY - 10) + 'px')
                            .style('background', 'rgba(0, 0, 0, 0.9)')
                            .style('color', 'white')
                            .style('padding', '12px')
                            .style('border-radius', '4px')
                            .style('font-size', '12px')
                            .style('pointer-events', 'all')
                            .style('cursor', 'move')
                            .style('z-index', '1001')
                            .style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)')
                            .html(`
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                                    <strong style="margin-right: 12px;">${countyName}</strong>
                                    <button class="close-tooltip" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px; padding: 0; line-height: 1;">&times;</button>
                                </div>
                                Total Samples: ${countyStats.count}<br/>
                                Pending: ${countyStats.pending}<br/>
                                Positive: ${countyStats.positive}<br/>
                                Negative: ${countyStats.negative}<br/>
                                Unsuitable: ${countyStats.unsuitable}
                            `);

                        // Create connection line
                        const connectionLine = linesGroup.append('line')
                            .attr('x1', centroid[0])
                            .attr('y1', centroid[1])
                            .attr('stroke', 'rgba(0, 0, 0, 0.5)')
                            .attr('stroke-width', 2)
                            .attr('stroke-dasharray', '4,4')
                            .style('pointer-events', 'none');

                        // Helper function to update line position
                        const updateLine = () => {
                            const tooltipNode = stickyTooltip.node();
                            const tooltipRect = tooltipNode.getBoundingClientRect();
                            const svgRect = svg.node().getBoundingClientRect();

                            // Calculate tooltip center in page coordinates
                            const tooltipCenterX = tooltipRect.left + tooltipRect.width / 2;
                            const tooltipCenterY = tooltipRect.top + tooltipRect.height / 2;

                            // Convert to SVG coordinates
                            const svgX = ((tooltipCenterX - svgRect.left) / svgRect.width) * width;
                            const svgY = ((tooltipCenterY - svgRect.top) / svgRect.height) * height;

                            connectionLine
                                .attr('x2', svgX)
                                .attr('y2', svgY);
                        };

                        // Initial line position
                        updateLine();

                        // Add close button handler
                        stickyTooltip.select('.close-tooltip').on('click', function(e) {
                            e.stopPropagation();
                            stickyTooltip.remove();
                            connectionLine.remove();
                            stickyTooltips.delete(countyName);
                        });

                        // Make tooltip draggable
                        let offsetX, offsetY;
                        const drag = d3.drag()
                            .on('start', function(event) {
                                isDragging = true;
                                tooltip.style('visibility', 'hidden');

                                // Calculate offset from where user clicked to tooltip position
                                const element = d3.select(this);
                                const currentLeft = parseInt(element.style('left')) || 0;
                                const currentTop = parseInt(element.style('top')) || 0;
                                offsetX = event.x - currentLeft;
                                offsetY = event.y - currentTop;

                                // Keep cursor as move during drag
                                element.style('cursor', 'move');
                            })
                            .on('drag', function(event) {
                                d3.select(this)
                                    .style('left', (event.x - offsetX) + 'px')
                                    .style('top', (event.y - offsetY) + 'px')
                                    .style('cursor', 'move');

                                // Update connection line position
                                updateLine();
                            })
                            .on('end', function() {
                                isDragging = false;
                                d3.select(this).style('cursor', 'move');
                            });

                        stickyTooltip.call(drag);
                        stickyTooltips.set(countyName, {
                            tooltip: stickyTooltip,
                            line: connectionLine
                        });
                    }
                });

            // Update legend
            this.updateLegend(maxValue, currentColorScale, selectedMetric);
        },

        updateLegend(maxValue, colorScale, metric) {
            const legendContainer = d3.select('#map-legend');
            legendContainer.html(''); // Clear existing content

            // Create gradient container
            const gradientContainer = legendContainer.append('div')
                .attr('class', 'map-legend-gradient');

            // Min label
            gradientContainer.append('span')
                .attr('class', 'map-legend-label')
                .text('0');

            // Gradient bar
            const gradientBar = gradientContainer.append('div')
                .attr('class', 'map-legend-bar')
                .style('background', `linear-gradient(to right, ${colorScale(0)}, ${colorScale(maxValue)})`);

            // Max label
            gradientContainer.append('span')
                .attr('class', 'map-legend-label')
                .text(maxValue);

            // Add note about grey counties
            legendContainer.append('div')
                .style('font-size', '0.7rem')
                .style('color', '#666')
                .style('margin-top', '0.5rem')
                .style('font-style', 'italic')
                .text('Grey counties contain no CWD data');
        },

        setMetric(metric) {
            selectedMetric = metric;
            if (window.dashboard && window.dashboard.filteredData) {
                this.update(window.dashboard.filteredData);
            }
        }
    };

    return mapAPI;
}