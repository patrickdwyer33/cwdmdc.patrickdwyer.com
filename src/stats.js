import * as d3 from 'd3';

export function updateStats(data) {
    if (!data || !Array.isArray(data)) {
        console.warn('Invalid data provided to updateStats');
        return;
    }

    // Calculate statistics - only count published records
    const publishedData = data.filter(d => d.publish === true);
    const totalSamples = publishedData.length;

    const pendingTests = publishedData.filter(d => d.result === 'Pending').length;
    const positiveTests = publishedData.filter(d => d.result === 'Positive').length;
    const notDetectedTests = publishedData.filter(d => d.result === 'Not detected').length;
    const unsuitableTests = publishedData.filter(d => d.result === 'Sample Unsuitable').length;

    // Update stat cards
    d3.select('#total-samples')
        .transition()
        .duration(300)
        .tween('text', function() {
            const current = parseInt(this.textContent) || 0;
            const interpolate = d3.interpolateNumber(current, totalSamples);
            return function(t) {
                this.textContent = Math.round(interpolate(t)).toLocaleString();
            };
        });

    d3.select('#counties-count')
        .transition()
        .duration(300)
        .tween('text', function() {
            const current = parseInt(this.textContent) || 0;
            const interpolate = d3.interpolateNumber(current, uniqueCounties);
            return function(t) {
                this.textContent = Math.round(interpolate(t));
            };
        });

    d3.select('#pending-tests')
        .transition()
        .duration(300)
        .tween('text', function() {
            const current = parseInt(this.textContent) || 0;
            const interpolate = d3.interpolateNumber(current, pendingTests);
            return function(t) {
                this.textContent = Math.round(interpolate(t)).toLocaleString();
            };
        });

    // Add additional stats if we have more stat cards
    const additionalStats = [
        { id: 'positive-tests', value: positiveTests },
        { id: 'not-detected-tests', value: notDetectedTests },
        { id: 'unsuitable-tests', value: unsuitableTests },
        { id: 'hunter-samples', value: data.filter(d => d.collectionType === '1').length },
        { id: 'surveillance-samples', value: data.filter(d => d.collectionType === '2').length },
        { id: 'male-samples', value: data.filter(d => d.deerSex === 'M').length },
        { id: 'female-samples', value: data.filter(d => d.deerSex === 'F').length }
    ];

    additionalStats.forEach(stat => {
        const element = d3.select(`#${stat.id}`);
        if (!element.empty()) {
            element
                .transition()
                .duration(300)
                .tween('text', function() {
                    const current = parseInt(this.textContent) || 0;
                    const interpolate = d3.interpolateNumber(current, stat.value);
                    return function(t) {
                        this.textContent = Math.round(interpolate(t)).toLocaleString();
                    };
                });
        }
    });

    // Log stats for debugging
    console.log('Stats updated:', {
        totalSamples,
        pendingTests,
        positiveTests,
        notDetectedTests,
        unsuitableTests
    });
}