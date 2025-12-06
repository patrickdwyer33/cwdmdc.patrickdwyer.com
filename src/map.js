import * as d3 from 'd3';
import { groupByCounty } from './data.js';

export async function createMap(selector) {
    const container = d3.select(selector);

    // Set up dimensions
    const width = 800;
    const height = 600;

    const svg = container
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background', '#f8f9fa');

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

    // Projection for Missouri
    const projection = d3.geoAlbersUsa()
        .scale(4000)
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    let countiesGroup, countiesData = null;

    // Try to load Missouri counties GeoJSON
    try {
        // You would need to provide a Missouri counties GeoJSON file
        // For now, we'll create a placeholder
        countiesGroup = svg.append('g').attr('class', 'counties');

        // Add a note about missing map data
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2 - 50)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .style('fill', '#666')
            .text('Missouri Counties Map');

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2)
            .attr('text-anchor', 'middle')
            .style('font-size', '14px')
            .style('fill', '#888')
            .text('(GeoJSON data needed for county boundaries)');

        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height / 2 + 30)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#888')
            .text('Sample data will be visualized here once map data is loaded');

    } catch (error) {
        console.warn('Could not load counties map data:', error);
    }

    // Color scale for sample counts
    const colorScale = d3.scaleSequential()
        .interpolator(d3.interpolateReds)
        .domain([0, 50]); // Will be updated based on actual data

    return {
        update(data) {
            const countyData = groupByCounty(data);

            // Update color scale domain
            const maxCount = d3.max(countyData, d => d.count) || 0;
            colorScale.domain([0, maxCount]);

            // For now, create a simple visualization showing county data as circles
            // This will be replaced when proper GeoJSON data is available

            // Clear previous visualizations
            svg.selectAll('.county-circle').remove();
            svg.selectAll('.county-label').remove();

            // Create a simple grid layout for counties
            const cols = Math.ceil(Math.sqrt(countyData.length));
            const cellWidth = width / cols;
            const cellHeight = height / cols;

            const circles = svg.selectAll('.county-circle')
                .data(countyData)
                .enter()
                .append('circle')
                .attr('class', 'county-circle')
                .attr('cx', (d, i) => (i % cols) * cellWidth + cellWidth / 2)
                .attr('cy', (d, i) => Math.floor(i / cols) * cellHeight + cellHeight / 2 + 100)
                .attr('r', d => Math.sqrt(d.count) * 2 + 5)
                .attr('fill', d => colorScale(d.count))
                .attr('stroke', '#333')
                .attr('stroke-width', 1)
                .style('cursor', 'pointer')
                .on('mouseover', function(event, d) {
                    tooltip
                        .style('visibility', 'visible')
                        .html(`
                            <strong>${d.county}</strong><br/>
                            Total Samples: ${d.count}<br/>
                            Pending: ${d.pending}<br/>
                            Positive: ${d.positive}<br/>
                            Negative: ${d.negative}
                        `);

                    d3.select(this)
                        .attr('stroke-width', 2)
                        .attr('stroke', '#000');
                })
                .on('mousemove', function(event) {
                    tooltip
                        .style('top', (event.pageY - 10) + 'px')
                        .style('left', (event.pageX + 10) + 'px');
                })
                .on('mouseout', function() {
                    tooltip.style('visibility', 'hidden');

                    d3.select(this)
                        .attr('stroke-width', 1)
                        .attr('stroke', '#333');
                })
                .on('click', function(event, d) {
                    // Filter by county
                    d3.select('#county-filter').node().value = d.county;
                    d3.select('#county-filter').dispatch('change');
                });

            // Add county labels
            svg.selectAll('.county-label')
                .data(countyData)
                .enter()
                .append('text')
                .attr('class', 'county-label')
                .attr('x', (d, i) => (i % cols) * cellWidth + cellWidth / 2)
                .attr('y', (d, i) => Math.floor(i / cols) * cellHeight + cellHeight / 2 + 120)
                .attr('text-anchor', 'middle')
                .style('font-size', '10px')
                .style('fill', '#333')
                .style('pointer-events', 'none')
                .text(d => d.county.length > 10 ? d.county.substring(0, 8) + '...' : d.county);

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