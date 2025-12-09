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
    const negativeTests = publishedData.filter(d => d.result === 'Negative').length;
    const unsuitableTests = publishedData.filter(d => d.result === 'Sample Unsuitable').length;

    // Update stat cards with animation
    const stats = [
        { id: '#total-samples', value: totalSamples },
        { id: '#positive-tests', value: positiveTests },
        { id: '#not-detected-tests', value: negativeTests },
        { id: '#pending-tests', value: pendingTests },
        { id: '#unsuitable-tests', value: unsuitableTests }
    ];

    stats.forEach(stat => {
        d3.select(stat.id)
            .transition()
            .duration(300)
            .tween('text', function() {
                const current = parseInt(this.textContent.replace(/,/g, '')) || 0;
                const interpolate = d3.interpolateNumber(current, stat.value);
                return function(t) {
                    this.textContent = Math.round(interpolate(t)).toLocaleString();
                };
            });
    });
}