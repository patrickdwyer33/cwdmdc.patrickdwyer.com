import * as d3 from "d3";

export function createTable(selector) {
	const container = d3.select(selector);
	let allData = [];
	let filteredData = [];
	let currentPage = 1;
	const itemsPerPage = 20;

	// Filter state
	const filters = {
		specimen: "",
		county: "",
		telecheck: "",
		result: new Set(),
		sex: new Set(),
		age: new Set(),
		sampleType: new Set(),
		harvestDateStart: null,
		harvestDateEnd: null,
	};

	// Create table structure
	const tableContainer = container
		.append("div")
		.attr("class", "table-responsive");

	const table = tableContainer.append("table").attr("class", "data-table");

	const thead = table.append("thead");
	const tbody = table.append("tbody");

	// Create table footer note (outside scrollable area)
	const footerNote = container
		.append("div")
		.attr("class", "table-footer-note")
		.style("font-size", "0.75rem")
		.style("color", "#666")
		.style("font-style", "italic")
		.style("padding", "0.5rem 0")
		.style("margin-top", "0.5rem")
		.text("* Collection date used when harvest date is not available");

	// Create pagination controls
	const paginationContainer = container
		.append("div")
		.attr("class", "pagination-container");

	const columns = [
		{ key: "specimenNo", label: "Specimen", width: "120px" },
		{ key: "countyName", label: "County", width: "100px" },
		{
			key: "harvestDate",
			label: "Harvested",
			width: "120px",
			format: (value, row) => formatDate(value, row.collectionDate),
		},
		{ key: "result", label: "Result", width: "80px", format: formatResult },
		{ key: "telecheckId", label: "Telecheck", width: "120px" },
		{ key: "deerSexName", label: "Sex", width: "60px" },
		{ key: "deerAgeName", label: "Age", width: "60px" },
		{ key: "sampleType", label: "Sample", width: "100px" },
	];

	// Create table header
	const headerRow = thead.append("tr");
	headerRow
		.selectAll("th")
		.data(columns)
		.enter()
		.append("th")
		.style("width", (d) => d.width)
		.style("cursor", "pointer")
		.text((d) => d.label)
		.on("click", function (event, d) {
			sortBy(d.key);
		});

	let sortKey = null;
	let sortDirection = "asc";

	// Set up filter toggle
	d3.select("#toggle-filters").on("click", function () {
		const filtersPanel = d3.select("#table-filters");
		const isVisible = filtersPanel.style("display") !== "none";

		filtersPanel.style("display", isVisible ? "none" : "block");
		d3.select(this).text(isVisible ? "Show Filters" : "Hide Filters");
	});

	// Set up clear filters button
	d3.select("#clear-filters").on("click", () => {
		clearAllFilters();
		applyFilters();
		renderTable();
		renderPagination();
	});

	// Set up search filter inputs
	d3.select("#filter-specimen").on("input", function () {
		filters.specimen = this.value.toLowerCase();
		applyFiltersWithDebounce();
	});

	d3.select("#filter-county-table").on("input", function () {
		filters.county = this.value.toLowerCase();
		applyFiltersWithDebounce();
	});

	d3.select("#filter-telecheck").on("input", function () {
		filters.telecheck = this.value.toLowerCase();
		applyFiltersWithDebounce();
	});

	// Set up date filters
	d3.select("#filter-harvest-start").on("change", function () {
		filters.harvestDateStart = this.value ? new Date(this.value) : null;
		applyFilters();
		renderTable();
		renderPagination();
	});

	d3.select("#filter-harvest-end").on("change", function () {
		filters.harvestDateEnd = this.value ? new Date(this.value) : null;
		applyFilters();
		renderTable();
		renderPagination();
	});

	// Debounce for text inputs
	let debounceTimer;
	function applyFiltersWithDebounce() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			applyFilters();
			renderTable();
			renderPagination();
		}, 300);
	}

	function initializeCheckboxFilters(data) {
		// Get unique values for each categorical field
		const results = [
			...new Set(data.map((d) => d.result).filter((v) => v)),
		].sort();
		const sexes = [
			...new Set(data.map((d) => d.deerSexName).filter((v) => v)),
		].sort();
		const ages = [
			...new Set(data.map((d) => d.deerAgeName).filter((v) => v)),
		].sort();
		const sampleTypes = [
			...new Set(data.map((d) => d.sampleType).filter((v) => v)),
		].sort();

		// Create checkboxes for results
		createCheckboxGroup(
			"#filter-result-group",
			results,
			filters.result,
			() => {
				applyFilters();
				renderTable();
				renderPagination();
			}
		);

		// Create checkboxes for sex
		createCheckboxGroup("#filter-sex-group", sexes, filters.sex, () => {
			applyFilters();
			renderTable();
			renderPagination();
		});

		// Create checkboxes for age
		createCheckboxGroup("#filter-age-group", ages, filters.age, () => {
			applyFilters();
			renderTable();
			renderPagination();
		});

		// Create checkboxes for sample type
		createCheckboxGroup(
			"#filter-sample-type-group",
			sampleTypes,
			filters.sampleType,
			() => {
				applyFilters();
				renderTable();
				renderPagination();
			}
		);
	}

	function createCheckboxGroup(selector, values, filterSet, onChange) {
		const group = d3.select(selector);
		group.selectAll("*").remove();

		values.forEach((value) => {
			const label = group.append("label");

			const checkbox = label
				.append("input")
				.attr("type", "checkbox")
				.attr("value", value)
				.on("change", function () {
					if (this.checked) {
						filterSet.add(value);
					} else {
						filterSet.delete(value);
					}
					onChange();
				});

			label.append("span").text(value);
		});
	}

	function clearAllFilters() {
		filters.specimen = "";
		filters.county = "";
		filters.telecheck = "";
		filters.result.clear();
		filters.sex.clear();
		filters.age.clear();
		filters.sampleType.clear();
		filters.harvestDateStart = null;
		filters.harvestDateEnd = null;

		// Clear UI
		d3.select("#filter-specimen").property("value", "");
		d3.select("#filter-county-table").property("value", "");
		d3.select("#filter-telecheck").property("value", "");
		d3.select("#filter-harvest-start").property("value", "");
		d3.select("#filter-harvest-end").property("value", "");
		d3.selectAll('.checkbox-group input[type="checkbox"]').property(
			"checked",
			false
		);
	}

	function applyFilters() {
		filteredData = allData.filter((d) => {
			// Text search filters
			if (
				filters.specimen &&
				!String(d.specimenNo).toLowerCase().includes(filters.specimen)
			) {
				return false;
			}
			if (
				filters.county &&
				!String(d.countyName || "")
					.toLowerCase()
					.includes(filters.county)
			) {
				return false;
			}
			if (
				filters.telecheck &&
				!String(d.telecheckId || "")
					.toLowerCase()
					.includes(filters.telecheck)
			) {
				return false;
			}

			// Checkbox filters (only filter if at least one is checked)
			if (filters.result.size > 0 && !filters.result.has(d.result)) {
				return false;
			}
			if (filters.sex.size > 0 && !filters.sex.has(d.deerSexName)) {
				return false;
			}
			if (filters.age.size > 0 && !filters.age.has(d.deerAgeName)) {
				return false;
			}
			if (
				filters.sampleType.size > 0 &&
				!filters.sampleType.has(d.sampleType)
			) {
				return false;
			}

			// Date range filters
			if (filters.harvestDateStart && d.harvestDate) {
				if (d.harvestDate < filters.harvestDateStart) {
					return false;
				}
			}
			if (filters.harvestDateEnd && d.harvestDate) {
				if (d.harvestDate > filters.harvestDateEnd) {
					return false;
				}
			}

			return true;
		});

		currentPage = 1;
	}

	function sortBy(key) {
		if (sortKey === key) {
			sortDirection = sortDirection === "asc" ? "desc" : "asc";
		} else {
			sortKey = key;
			sortDirection = "asc";
		}

		// Update header styles
		headerRow
			.selectAll("th")
			.classed("sorted-asc", false)
			.classed("sorted-desc", false);

		headerRow
			.selectAll("th")
			.filter((d) => d.key === key)
			.classed(`sorted-${sortDirection}`, true);

		// Sort data
		filteredData.sort((a, b) => {
			let aVal = a[key];
			let bVal = b[key];

			// Handle dates
			if (aVal instanceof Date && bVal instanceof Date) {
				aVal = aVal.getTime();
				bVal = bVal.getTime();
			}

			// Handle nulls
			if (aVal == null && bVal == null) return 0;
			if (aVal == null) return 1;
			if (bVal == null) return -1;

			// Convert to strings for comparison if needed
			if (typeof aVal === "string" && typeof bVal === "string") {
				aVal = aVal.toLowerCase();
				bVal = bVal.toLowerCase();
			}

			if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
			if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
			return 0;
		});

		currentPage = 1;
		renderTable();
		renderPagination();
	}

	function renderTable() {
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		const pageData = filteredData.slice(startIndex, endIndex);

		// Clear existing rows
		tbody.selectAll("tr").remove();

		// Add rows
		const rows = tbody
			.selectAll("tr")
			.data(pageData)
			.enter()
			.append("tr")
			.on("mouseover", function () {
				d3.select(this).classed("highlight", true);
			})
			.on("mouseout", function () {
				d3.select(this).classed("highlight", false);
			});

		// Add cells
		rows.selectAll("td")
			.data((d) =>
				columns.map((col) => ({
					key: col.key,
					value: d[col.key],
					format: col.format,
					original: d,
				}))
			)
			.enter()
			.append("td")
			.html((d) => {
				if (d.format) {
					return d.format(d.value, d.original);
				}
				return d.value || "-";
			})
			.attr("data-label", (d) => d.key);

		// Update count display
		d3.select("#table-count").text(`${filteredData.length} samples`);
	}

	function renderPagination() {
		const totalPages = Math.ceil(filteredData.length / itemsPerPage);

		paginationContainer.selectAll("*").remove();

		if (totalPages <= 1) return;

		const pagination = paginationContainer
			.append("div")
			.attr("class", "pagination");

		// Previous button
		pagination
			.append("button")
			.attr("class", "pagination-btn")
			.property("disabled", currentPage === 1)
			.text("Previous")
			.on("click", () => {
				if (currentPage > 1) {
					currentPage--;
					renderTable();
					renderPagination();
				}
			});

		// Page info
		pagination
			.append("span")
			.attr("class", "pagination-info")
			.text(`Page ${currentPage} of ${totalPages}`);

		// Next button
		pagination
			.append("button")
			.attr("class", "pagination-btn")
			.property("disabled", currentPage === totalPages)
			.text("Next")
			.on("click", () => {
				if (currentPage < totalPages) {
					currentPage++;
					renderTable();
					renderPagination();
				}
			});
	}

	function formatDate(harvestDate, collectionDate) {
		let dateToUse = harvestDate;
		let useCollectionDate = false;

		if (!harvestDate && collectionDate) {
			dateToUse = collectionDate;
			useCollectionDate = true;
		}

		if (!dateToUse) return "-";

		const month = String(dateToUse.getMonth() + 1).padStart(2, '0');
		const day = String(dateToUse.getDate()).padStart(2, '0');
		const year = String(dateToUse.getFullYear()).slice(-2);
		const formattedDate = `${month}/${day}/${year}`;

		return useCollectionDate ? `${formattedDate}*` : formattedDate;
	}

	function formatResult(result) {
		if (!result) return "-";

		const colors = {
			Pending: "#ffc107",
			Positive: "#dc3545",
			Negative: "#28a745",
			"Unfit": "#6c757d",
		};

		const color = colors[result] || "#6c757d";

		return `<span class="result-badge" style="background-color: ${color}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold;">${result}</span>`;
	}

	return {
		update(newData) {
			allData = newData;
			filteredData = [...allData];

			// Initialize checkbox filters
			initializeCheckboxFilters(allData);

			// Apply any active filters
			applyFilters();

			// Re-apply current sort if any
			if (sortKey) {
				sortBy(sortKey);
			} else {
				renderTable();
				renderPagination();
			}
		},

		search(searchTerm) {
			// Legacy search function for backward compatibility
			// Now handled by the filter system
		},
	};
}
