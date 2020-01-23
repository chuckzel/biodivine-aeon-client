let EdgeMonotonicity = {
	unspecified: "unspecified",
	activation: "activation",
	inhibition: "inhibition",
}

/*
	Responsible for managing the cytoscape editor object. It has its own representation of the graph,
	but it should never be updated directly. Instead, always use LiveModel to specify updates.
*/
let CytoscapeEditor = {
	
	// Reference to the cytoscape library "god object"
	_cytoscape: undefined,
	// Reference to the edgehandles library "god object"
	_edgehandles: undefined,
	// Used to implement the double click feature
	_lastClickTimestamp: undefined,

	init: function() {
		this._cytoscape = cytoscape(this.initOptions());
		this._edgehandles = this._cytoscape.edgehandles(this.edgeOptions());
		// When the user moves or zooms the graph, position of menu must update as well.
		this._cytoscape.on('zoom', (e) => {
			this._renderMenuForSelectedNode();
			this._renderMenuForSelectedEdge();
		});
		this._cytoscape.on('pan', (e) => { 
			this._renderMenuForSelectedNode();
			this._renderMenuForSelectedEdge();
		});
		this._cytoscape.on('click', (e) => {
			let now = (new Date()).getTime();
			if (this._lastClickTimestamp && now - this._lastClickTimestamp < DOUBLE_CLICK_DELAY) {				
				LiveModel.addVariable([e.position['x'], e.position['y']]);
			}
			this._lastClickTimestamp = now;
		});
	},

	// Return an id of the selected node, or undefined if nothing is selected.
	getSelectedNodeId() {
		let node = CytoscapeEditor._cytoscape.nodes(":selected");
		if (node.length == 0) return undefined;	// nothing selected
		return node.id();
	},

	// Add a new node to the graph at the given position.
	// (Int, String, [Num, Num])
	addNode(id, name, position = [0,0]) {
		let node = this._cytoscape.add({
			data: { id: id, name: name },
			position: { x: position[0], y: position[1] },
		})
		node.on('mouseover', (e) => {
			node.addClass('hover');	
			ModelEditor.hoverVariable(id, true);		
		});
		node.on('mouseout', (e) => {
			node.removeClass('hover');			
			ModelEditor.hoverVariable(id, false);		
		});
		node.on('select', (e) => {			
			CytoscapeEditor._renderMenuForSelectedNode(node);
			ModelEditor.selectVariable(id, true);
		})
		node.on('unselect', (e) => {
			UI.toggleNodeMenu();
			ModelEditor.selectVariable(id, false);
		})
		node.on('click', (e) => {						
			this._lastClickTimestamp = undefined; // ensure that we cannot double-click inside the node
		})
		node.on('drag', (e) => {			
			if (node.selected()) CytoscapeEditor._renderMenuForSelectedNode(node);
			CytoscapeEditor._renderMenuForSelectedEdge();
		})
	},

	// Remove the node with the given ID from the graph.
	removeNode(id) {		
		let node = this._cytoscape.getElementById(id);
		if (node !== undefined) {
			if (node.selected()) node.unselect();	// ensure menu is hidden, etc.
			this._cytoscape.remove(node);		
		} else {
			console.log("[CytoscapeEditor] Cannot remove "+id+" - node not found.");
		}
	},

	// Change name of the node to the given value.
	renameNode(id, newName) {
		let node = this._cytoscape.getElementById(id);
		if (node !== undefined) {
			let data = node.data();
			data["name"] = newName;
			this._cytoscape.style().update();	//redraw graph
		}
	},

	// Allow to externally set which node is hovered - make sure to unset it as well.
	hoverNode(id, isHover) {
		let node = this._cytoscape.getElementById(id);
		if (isHover) {
			node.addClass('hover');
		} else {
			node.removeClass('hover');
		}
	},

	// Zoom and pan the editor to ensure that given node is visible.
	showNode(id) {
		let node = this._cytoscape.getElementById(id);
		if (node !== undefined) {					
			// Taken from https://github.com/cytoscape/cytoscape.js/issues/1691
			let zoom    = 1.1;
		    let bb = node.boundingBox(); 
		    let w   = this._cytoscape.width()
		    let h = this._cytoscape.height();
		    var pan = {
	    	  // add some random padding so it does not end up under the editor panel
		      x: ((w - zoom * ( bb.x1 + bb.x2 )) / 2)+250,
		      y: (h - zoom * ( bb.y1 + bb.y2 )) / 2
		    };

		    this._cytoscape.animate({
		      zoom: 1.1, 
		      pan: pan
		    });
		}
	},

	// Return a { regulator, target } object that describes currently selected regulation,
	// or undefined if nothing is selected.
	getSelectedRegulationPair() {
		let edge = CytoscapeEditor._cytoscape.edges(":selected");
		if (edge.length == 0) return undefined;	// nothing selected
		return { regulator: edge.data().source, target: edge.data().target };
	},

	// Ensure that the graph contains edge which corresponds to the provided regulation.
	ensureRegulation(regulation) {		
		let currentEdge = this._findRegulationEdge(regulation.regulator, regulation.target);
		if (currentEdge !== undefined) {
			// Edge exists - just make sure to update data
			let data = currentEdge.data();
			data.observable = regulation.observable;
			data.monotonicity = regulation.monotonicity;
			this._cytoscape.style().update();	//redraw graph
			if (currentEdge.selected()) {			
				// if the edge is selected, we also redraw the edge menu
				this._renderMenuForSelectedEdge(currentEdge);
			}	
		} else {
			// Edge does not exist - create a new one
			let edge = this._cytoscape.add({
				group: 'edges', data: { 
					source: regulation.regulator, target: regulation.target,
					observable: regulation.observable, monotonicity: regulation.monotonicity
				}
			});
			this._initEdge(edge);
		}		
	},

	// Remove regulation between the two specified nodes.
	removeRegulation(regulatorId, targetId) {
		let edge = this._findRegulationEdge(regulatorId, targetId);
		if (edge !== undefined) {
			if (edge.selected()) edge.unselect();
			this._cytoscape.remove(edge);
		}
	},

	// Return the edge which represents regulation between the given pair of variables or undefined
	// if such edge does not exist.
	_findRegulationEdge(regulatorId, targetId) {
		let edge = this._cytoscape.edges("[source = \""+regulatorId+"\"][target = \""+targetId+"\"]");
		if (edge.length == 1) {
			return edge[0];
		} else {
			return undefined;
		}
	},

	// Update the node menu to be shown exactly for this element
	// (including zoom and other node proeprties)
	// If the node is undefined, try to find it
	// (element?)
	_renderMenuForSelectedNode(node) {
		if (node === undefined) {
			node = CytoscapeEditor._cytoscape.nodes(":selected");
			if (node.length == 0) return;	// nothing selected
		}
		let zoom = CytoscapeEditor._cytoscape.zoom();			
		let position = node.renderedPosition();
		let height = node.height() * zoom;			
		UI.toggleNodeMenu([position["x"], position["y"] + 3*height], zoom);
	},

	// Update the edge menu to be shown exactly for the currently selected edge.
	// If edge is undefined, try to obtain the selected edge.
	_renderMenuForSelectedEdge(edge) {
		if (edge === undefined) {
			edge = CytoscapeEditor._cytoscape.edges(":selected");
			if (edge.length == 0) return;	// nothing selected
		}
		let zoom = CytoscapeEditor._cytoscape.zoom();
		let boundingBox = edge.renderedBoundingBox();
		let position = [ (boundingBox.x1 + boundingBox.x2) / 2, (boundingBox.y1 + boundingBox.y2) / 2 ];
		UI.toggleEdgeMenu(edge.data(), position, zoom);
	},

	// Helper function to initialize new edge object, since edges can appear explicitly
	// or from the edgehandles plugin.
	_initEdge(edge) {
		edge.on("select", (e) => {
			this._renderMenuForSelectedEdge(edge);
		});
		edge.on("unselect", (e) => {
			UI.toggleEdgeMenu();	// hide menu
		});
	},

	initOptions: function() {
		return {
			container: UI.cytoscapeEditor,			
			// Some sensible default auto-layout algorithm
  			layout: {
	            animate: true,
	            animationDuration: 300,
	            animationThreshold: 250,
	            refresh: 20,
	            fit: true,
	            name: 'cose',
	            padding: 250,
	            nodeRepulsion: function(node) { return 100000; },
	            nodeDimensionsIncludeLabels: true,
        	},
  			style: [
  				{ 	// Style of the graph nodes
  					'selector': 'node[name]',
  					'style': {
  						// 
  						'label': 'data(name)',	
  						// put label in the middle of the node (vertically)
  						'text-valign': 'center',
  						'width': 'label', 'height': 'label',
  						// a rectangle with slightly sloped edges
  						'shape': 'barrel',
  						// when selecting, do not display any overlay
  						'overlay-opacity': 0,
  						// other visual styles
		                'padding': 12,		                
		                'background-color': '#dddddd',
		                'font-family': 'Fira Mono',
		                'font-size': '24pt',
		                'border-width': '1px',
		                'border-color': '#bbbbbb',
		                'border-style': 'solid',
  					}
  				},  				
  				{	// When a node is highlighted by mouse, show it with a dashed blue border.
  					'selector': 'node.hover',
  					'style': {
  						'border-width': '1.6px',
  						'border-color': '#6a7ea5',
						'border-style': 'dashed',                		
  					}
  				},
  				{	// When a node is selected, show it with a thick blue border.
  					'selector': 'node:selected',
  					'style': {
  						'border-width': '2.0px',
  						'border-color': '#6a7ea5',
  						'border-style': 'solid',                		
  					}
  				},
  				{	// General style of the graph edge
		            'selector': 'edge',
		            'style': {
		                'width': 4.0,
		                'curve-style': 'bezier',
		                'loop-direction': '-15deg',
		                'loop-sweep': '30deg',
		                'text-outline-width': 2.3,
		                'text-outline-color': '#cacaca',
		                'font-family': 'FiraMono',
		            }
		        },
		        {	// Show non-observable edges as dashed
		            'selector': 'edge[observable]',
		            'style': {
		            	'line-style': (edge) => { if (edge.data().observable) { return "solid"; } else { return "dashed"; } },
		                'line-dash-pattern': [8, 3],
		            }
		        },
		        {	// When the edge is an activation, show it as green with normal arrow
		            'selector': 'edge[monotonicity="activation"]',
		            'style': {
		                'line-color': '#4abd73',
		                'target-arrow-color': '#4abd73',
		                'target-arrow-shape': 'triangle'
		            }
		        },
		        {	// When the edge is an inhibition, show it as red with a `tee` arrow
		            'selector': 'edge[monotonicity="inhibition"]',
		            'style': {
		                'line-color': '#d05d5d',
		                'target-arrow-color': '#d05d5d',
		                'target-arrow-shape': 'tee',
		            }
		        },
		        {	// When the edge has unspecified monotonicity, show it as grey with normal arrow
		            'selector': 'edge[monotonicity="unspecified"]',
		            'style': {
		                'line-color': '#797979',
		                'target-arrow-color': '#797979',
		                'target-arrow-shape': 'triangle',
		            }
		        },
		        {	// A selected edge should be drawn with an overlay
		            'selector': 'edge:selected',
		            'style': {
		                'overlay-opacity': 0.1,
		            }
		        },
  				{	// Edge handles pseudo-node for adding
		            'selector': '.eh-handle',
		            'style': {
		                'background-color': '#ffffff',
		                'color': '#6a7ea5',
		                // Node is intentionally smaller so that it provides background
		                // just for the `+`` cutout in the icon
		                'width': '15px',
		                'height': '15px',
		                'shape': 'square',
		                'font-family': 'Material Icons',
		                'padding': 0,
		                'overlay-opacity': 0,
		                'border-width': 0,
		                'border-opacity': 0,
		                // Material icon for a box with a plus sign
		                'label': 'add_box',
		                'text-valign': 'center',
		                'text-halign': 'center',
		                'font-size': '24px',
		            }
		        },		        
		        {	// Change ghost edge preview colors
		            'selector': '.eh-preview, .eh-ghost-edge',
		            'style': {
		                'background-color': '#797979',
		                'line-color': '#797979',
		                'target-arrow-color': '#797979',
		                'target-arrow-shape': 'triangle',
		            }
		        },
		        {	// Hide ghost edge when a snapped preview is visible
		            'selector': '.eh-ghost-edge.eh-preview-active',
		            'style': { 'opacity': 0 }
		        }
			],		
		}
	},

	edgeOptions() {
		return {
			preview: true, // whether to show added edges preview before releasing selection
	        hoverDelay: 150, // time spent hovering over a target node before it is considered selected
	        handleNodes: 'node', // selector/filter function for whether edges can be made from a given node
	        snap: false,
	        snapThreshold: 50,
	        snapFrequency: 15,
	        noEdgeEventsInDraw: false,
	        disableBrowserGestures: true, 
	        nodeLoopOffset: -50,
	        // The `+` button should be drawn on top of each node
	        handlePosition: function(node) { return 'middle top'; },
	        handleInDrawMode: false,
	        edgeType: function(sourceNode, targetNode) { return 'flat'; },
	        // Loops are always allowed
	        loopAllowed: function(node) { return true; },	        
	        // Initialize edge with default parameters
	        edgeParams: function(sourceNode, targetNode, i) {
	            return { data: { observable: true, monotonicity: EdgeMonotonicity.unspecified }};
	        },
	        // Add the edge to the live model
	        complete: function(sourceNode, targetNode, addedEles) {	        	
	        	if (!LiveModel.addRegulation(sourceNode.id(), targetNode.id(), true, EdgeMonotonicity.unspecified)) {
	        		addedEles.remove();	// if we can't create the regulation, remove new edge
	        	} else {
	        		CytoscapeEditor._initEdge(addedEles[0]);
	        	}	        	
	        },
		};
	},
}