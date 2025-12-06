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

    // Color scale for sample counts
    const colorScale = d3.scaleSequential()
        .interpolator(d3.interpolateReds)
        .domain([0, 50]); // Will be updated based on actual data

    return {
        update(data) {
            if (!moCounties) {
                console.warn('Map data not loaded yet');
                return;
            }

            const countyData = groupByCounty(data);

            // Create a lookup map from county name to data
            const dataByCounty = new Map(countyData.map(d => [d.county.toLowerCase(), d]));

            // Update color scale domain
            const maxCount = d3.max(countyData, d => d.count) || 0;
            colorScale.domain([0, maxCount]);

            // Update county colors and interactivity
            countiesGroup.selectAll('.county')
                .attr('fill', function(d) {
                    // Get county name from the feature properties
                    // US Atlas uses the "name" property for county names
                    const countyName = d.properties?.name?.toLowerCase();
                    const countyStats = dataByCounty.get(countyName);

                    if (countyStats && countyStats.count > 0) {
                        return colorScale(countyStats.count);
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

                    d3.select(this)
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
                    const countyName = d.properties?.name;
                    if (countyName) {
                        d3.select('#county-filter').node().value = countyName;
                        d3.select('#county-filter').dispatch('change');
                    }
                });

            // Update legend
            this.updateLegend(maxCount);
        },

        updateLegend(maxCount) {
            svg.selectAll('.legend').remove();

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
                .attr('stop-color', colorScale(maxCount));

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
                .text(maxCount);

            legend.append('text')
                .attr('x', legendWidth / 2)
                .attr('y', -5)
                .attr('text-anchor', 'middle')
                .style('font-size', '12px')
                .style('font-weight', 'bold')
                .text('Sample Count');
        }
    };
}