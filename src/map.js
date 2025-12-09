import * as d3 from "d3";
import { groupByCounty } from "./data.js";

export async function createMap(selector) {
	// Select the existing SVG element
	const svg = d3.select(selector);
	const countyFillsGroup = svg.select("#county-fills");
	const countyOutlinesGroup = svg.select("#county-outlines");

	// Get SVG dimensions for coordinate calculations
	const svgNode = svg.node();
	const viewBox = svg.attr("viewBox").split(" ");
	const width = parseFloat(viewBox[2]);
	const height = parseFloat(viewBox[3]);

	// Create connection lines group (insert before fills so lines appear behind counties)
	const linesGroup = svg
		.insert("g", "#county-fills")
		.attr("class", "connection-lines");

	// Create tooltip
	const tooltip = d3
		.select("body")
		.append("div")
		.attr("class", "map-tooltip")
		.style("position", "absolute")
		.style("visibility", "hidden")
		.style("background", "rgba(0, 0, 0, 0.8)")
		.style("color", "white")
		.style("padding", "10px")
		.style("border-radius", "5px")
		.style("font-size", "12px")
		.style("pointer-events", "none")
		.style("z-index", "1000");

	// Track sticky tooltips and drag state
	const stickyTooltips = new Map(); // countyClass -> {tooltip, line, county}
	let isDragging = false;

	// Helper function to normalize county names to class format
	// Converts "St. Louis" to "st_louis"
	const normalizeCountyName = (name) => {
		if (!name) return "";
		return name
			.toLowerCase()
			.replace(/\./g, "") // Remove periods
			.replace(/\s+/g, "_"); // Replace spaces with underscores
	};

	// Helper function to convert class name back to display name
	// Converts "st_louis" to "St Louis" (title case)
	const classToDisplayName = (className) => {
		return className
			.replace(/_/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());
	};

	// Helper function to get county centroid from path bounding box
	const getCountyCentroid = (countyClass) => {
		const fillPath = countyFillsGroup.select(`.${countyClass}`);
		if (fillPath.empty()) return null;

		const bbox = fillPath.node().getBBox();
		return [bbox.x + bbox.width / 2, bbox.y + bbox.height / 2];
	};

	// Color scales for different metrics
	const colorScales = {
		total: d3.scaleSequential(d3.interpolateBlues),
		positive: d3.scaleSequential(d3.interpolateReds),
		notDetected: d3.scaleSequential(d3.interpolateGreens),
		pending: d3.scaleSequential(d3.interpolateOranges),
		unsuitable: d3.scaleSequential(d3.interpolateGreys),
	};

	let selectedMetric = "positive";

	// Add event listeners to fill paths
	const setupCountyInteractions = (dataByCounty) => {
		countyFillsGroup
			.selectAll("path")
			.style("cursor", "pointer")
			.on("mouseover", function (event) {
				if (isDragging) return;

				const countyClass = d3.select(this).attr("class");
				const countyName = classToDisplayName(countyClass);
				const countyStats = dataByCounty.get(countyClass);

				if (countyStats) {
					tooltip.style("visibility", "visible").html(`
                            <strong>${countyName}</strong><br/>
                            Total Samples: ${countyStats.count}<br/>
                            Pending: ${countyStats.pending}<br/>
                            Positive: ${countyStats.positive}<br/>
                            Negative: ${countyStats.negative}<br/>
                            Unsuitable: ${countyStats.unsuitable}
                        `);
				} else {
					tooltip.style("visibility", "visible").html(`
                            <strong>${countyName}</strong><br/>
                            No CWD samples
                        `);
				}

				// Highlight outline
				const outlinePath = countyOutlinesGroup.select(
					`.${countyClass}`
				);
				outlinePath
					.raise()
					.attr("stroke", "#000")
					.attr("stroke-width", 2);

				// Re-raise all highlighted counties to keep them on top
				stickyTooltips.forEach(({ county }) => {
					county.raise();
				});
			})
			.on("mousemove", function (event) {
				tooltip
					.style("top", event.pageY - 10 + "px")
					.style("left", event.pageX + 10 + "px");
			})
			.on("mouseout", function () {
				const countyClass = d3.select(this).attr("class");

				tooltip.style("visibility", "hidden");

				// Only reset outline if it doesn't have a sticky tooltip
				if (!stickyTooltips.has(countyClass)) {
					const outlinePath = countyOutlinesGroup.select(
						`.${countyClass}`
					);
					outlinePath.attr("stroke", "#fff").attr("stroke-width", 1);
				}
			})
			.on("click", function (event) {
				event.stopPropagation();

				const countyClass = d3.select(this).attr("class");
				const countyName = classToDisplayName(countyClass);

				// Toggle sticky tooltip
				if (stickyTooltips.has(countyClass)) {
					// Remove existing sticky tooltip, line, and county highlight
					const {
						tooltip: existingTooltip,
						line: existingLine,
						county: existingCounty,
					} = stickyTooltips.get(countyClass);
					existingTooltip.remove();
					existingLine.remove();
					existingCounty.classed("county-highlighted", false);
					stickyTooltips.delete(countyClass);
				} else {
					// Create new sticky tooltip
					const countyStats = dataByCounty.get(countyClass);
					if (!countyStats) return;

					// Apply highlight class to county outline
					const countyElement = countyOutlinesGroup.select(
						`.${countyClass}`
					);
					countyElement.raise().classed("county-highlighted", true);

					// Calculate county centroid from bounding box
					const centroid = getCountyCentroid(countyClass);
					if (!centroid) return;

					const stickyTooltip = d3
						.select("body")
						.append("div")
						.attr("class", "sticky-tooltip")
						.style("position", "absolute")
						.style("left", event.pageX + 10 + "px")
						.style("top", event.pageY - 10 + "px")
						.style("background", "rgba(0, 0, 0, 0.9)")
						.style("color", "white")
						.style("padding", "12px")
						.style("border-radius", "4px")
						.style("font-size", "12px")
						.style("pointer-events", "all")
						.style("cursor", "move")
						.style("z-index", "1001")
						.style("box-shadow", "0 4px 6px rgba(0,0,0,0.3)").html(`
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
					const connectionLine = linesGroup
						.append("line")
						.attr("x1", centroid[0])
						.attr("y1", centroid[1])
						.attr("stroke", "rgba(0, 0, 0, 0.5)")
						.attr("stroke-width", 2)
						.attr("stroke-dasharray", "4,4")
						.style("pointer-events", "none");

					// Helper function to update line position
					const updateLine = () => {
						const tooltipNode = stickyTooltip.node();
						const tooltipRect = tooltipNode.getBoundingClientRect();
						const svgRect = svgNode.getBoundingClientRect();

						// Calculate tooltip center in page coordinates
						const tooltipCenterX =
							tooltipRect.left + tooltipRect.width / 2;
						const tooltipCenterY =
							tooltipRect.top + tooltipRect.height / 2;

						// Convert to SVG coordinates
						const svgX =
							((tooltipCenterX - svgRect.left) / svgRect.width) *
							width;
						const svgY =
							((tooltipCenterY - svgRect.top) / svgRect.height) *
							height;

						connectionLine.attr("x2", svgX).attr("y2", svgY);
					};

					// Initial line position
					updateLine();

					// Add close button handler
					stickyTooltip
						.select(".close-tooltip")
						.on("click", function (e) {
							e.stopPropagation();
							stickyTooltip.remove();
							connectionLine.remove();
							countyElement
								.classed("county-highlighted", false)
								.attr("stroke", "#fff")
								.attr("stroke-width", 1);
							stickyTooltips.delete(countyClass);
						});

					// Make tooltip draggable
					let offsetX, offsetY;
					const drag = d3
						.drag()
						.on("start", function (event) {
							isDragging = true;
							tooltip.style("visibility", "hidden");

							// Calculate offset from where user clicked to tooltip position
							const element = d3.select(this);
							const currentLeft =
								parseInt(element.style("left")) || 0;
							const currentTop =
								parseInt(element.style("top")) || 0;
							offsetX = event.x - currentLeft;
							offsetY = event.y - currentTop;

							element.style("cursor", "move");
						})
						.on("drag", function (event) {
							d3.select(this)
								.style("left", event.x - offsetX + "px")
								.style("top", event.y - offsetY + "px")
								.style("cursor", "move");

							updateLine();
						})
						.on("end", function () {
							isDragging = false;
							d3.select(this).style("cursor", "move");
						});

					stickyTooltip.call(drag);
					stickyTooltips.set(countyClass, {
						tooltip: stickyTooltip,
						line: connectionLine,
						county: countyElement,
					});
				}
			});
	};

	const mapAPI = {
		update(data) {
			const countyData = groupByCounty(data);

			// Create a lookup map from county class to data
			const dataByCounty = new Map(
				countyData.map((d) => [normalizeCountyName(d.county), d])
			);

			// Get the current color scale and max value for selected metric
			const currentColorScale = colorScales[selectedMetric];

			// Determine max value based on selected metric
			let maxValue = 0;
			switch (selectedMetric) {
				case "total":
					maxValue = d3.max(countyData, (d) => d.count) || 0;
					break;
				case "positive":
					maxValue = d3.max(countyData, (d) => d.positive) || 0;
					break;
				case "notDetected":
					maxValue = d3.max(countyData, (d) => d.negative) || 0;
					break;
				case "pending":
					maxValue = d3.max(countyData, (d) => d.pending) || 0;
					break;
				case "unsuitable":
					maxValue = d3.max(countyData, (d) => d.unsuitable) || 0;
					break;
			}

			currentColorScale.domain([0, maxValue]);

			// Update county fill colors
			countyFillsGroup.selectAll("path").attr("fill", function () {
				const countyClass = d3.select(this).attr("class");
				const countyStats = dataByCounty.get(countyClass);

				if (countyStats && countyStats.count > 0) {
					// Get the value for the selected metric
					let value = 0;
					switch (selectedMetric) {
						case "total":
							value = countyStats.count;
							break;
						case "positive":
							value = countyStats.positive;
							break;
						case "notDetected":
							value = countyStats.negative;
							break;
						case "pending":
							value = countyStats.pending;
							break;
						case "unsuitable":
							value = countyStats.unsuitable;
							break;
					}

					return currentColorScale(value);
				}
				return "#e0e0e0"; // Default gray for counties with no data
			});

			// Setup interactions
			setupCountyInteractions(dataByCounty);

			// Update legend
			this.updateLegend(maxValue, currentColorScale, selectedMetric);
		},

		updateLegend(maxValue, colorScale, metric) {
			const legendContainer = d3.select("#map-legend");
			legendContainer.html("");

			// Create gradient container
			const gradientContainer = legendContainer
				.append("div")
				.attr("class", "map-legend-gradient");

			// Min label
			gradientContainer
				.append("span")
				.attr("class", "map-legend-label")
				.text("0");

			// Gradient bar
			gradientContainer
				.append("div")
				.attr("class", "map-legend-bar")
				.style(
					"background",
					`linear-gradient(to right, ${colorScale(0)}, ${colorScale(
						maxValue
					)})`
				);

			// Max label
			gradientContainer
				.append("span")
				.attr("class", "map-legend-label")
				.text(maxValue);

			// Add note about grey counties
			legendContainer
				.append("div")
				.style("font-size", "0.7rem")
				.style("color", "#666")
				.style("margin-top", "0.5rem")
				.style("font-style", "italic")
				.text("Grey counties contain no CWD data");
		},

		setMetric(metric) {
			selectedMetric = metric;
			if (window.dashboard && window.dashboard.filteredData) {
				this.update(window.dashboard.filteredData);
			}
		},
	};

	return mapAPI;
}
