function init() {
	// Set engine address according to query parameter
	const urlParams = new URLSearchParams(window.location.search);
	const engineAddress = urlParams.get('engine');	
	console.log(engineAddress);
	ComputeEngine.openConnection(undefined, engineAddress);
	
	CytoscapeEditor.init();

	document.fonts.load('1rem "symbols"').then(() => {
	document.fonts.load('1rem "FiraMono"').then(() => {
		ComputeEngine.getBifurcationTree((e, r) => {		
			for (node of r) {
				console.log("Node: ", node);
				CytoscapeEditor.ensureNode(node);
			}
			for (node of r) {
				if (node.type == "decision") {
					CytoscapeEditor.ensureEdge(node.id, node.left, false);
					CytoscapeEditor.ensureEdge(node.id, node.right, true);
				}
			}

			CytoscapeEditor.applyTreeLayout();				
		}, true);
	})});
}

function selectAttribute(node, attr) {
	ComputeEngine.selectDecisionAttribute(node, attr, (e, r) => {
		console.log(r);
		for (node of r) {
			console.log("Node: ", node);
			CytoscapeEditor.ensureNode(node);
		}
		for (node of r) {
			if (node.type == "decision") {
				CytoscapeEditor.ensureEdge(node.id, node.left, false);
				CytoscapeEditor.ensureEdge(node.id, node.right, true);
			}
		}
		CytoscapeEditor.applyTreeLayout();
	});
}