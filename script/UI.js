let ContentTabs = {
	engine: "tab-engine",
	modelEditor: "tab-model-editor",
}

const DOUBLE_CLICK_DELAY = 400;

/*
	Allows access to operations with the global UI (i.e. operating the menus, showing content panels, etc.).
*/
let UI = {

	// Element where the cytoscape editor resides.
	cytoscapeEditor: undefined,
	// Element of the menu that is displayed for each node/edge when selected.
	_nodeMenu: undefined,
	_edgeMenu: undefined,
	// Contains pairs of elements of the form { button: ..., tab: ... } corresponding to the side menu.
	_tabsAndButtons: undefined,

	init: function() {
		this.cytoscapeEditor = document.getElementById("cytoscape-editor");		
		this._nodeMenu = document.getElementById("node-menu");
		this._edgeMenu = document.getElementById("edge-menu");
		
		let sideMenu = document.getElementById("side-menu");
		let sideMenuButtons = sideMenu.getElementsByClassName("button");
		this._tabsAndButtons = [];
		for (var i = 0; i < sideMenuButtons.length; i++) {
			let button = sideMenuButtons[i];
			let tab = document.getElementById(button.getAttribute("tab-id"));
			this._tabsAndButtons.push({ tab: tab, button: button });
		}
		
		this._initNodeMenu(this._nodeMenu);
		this._initEdgeMenu(this._edgeMenu);
		this._initSideMenu(sideMenu);	
	},

	isEdgeMenuVisible() {
		return !this._edgeMenu.classList.contains("invisible");
	},

	isNodeMenuVisible() {
		return !this._nodeMenu.classList.contains("invisible");
	},

	// Close any content tab, if open.
	closeContent() {
		this.ensureContentTabOpen(undefined);
	},

	// Make sure the given content tab is open (for example because there is content in it that
	// needs to be seen).
	ensureContentTabOpen(tabId) {
		for (var i = 0; i < this._tabsAndButtons.length; i++) {
			let item = this._tabsAndButtons[i];
			if (item.tab.getAttribute("id") == tabId) {
				item.button.classList.add("selected");
				item.tab.classList.remove("gone");
			} else {
				item.button.classList.remove("selected");
				item.tab.classList.add("gone");
			}			
		}	
	},	


	// If given a position, show the center of the node menu at that position.
	// If no position is given, hide the menu.
	// ([Num, Num], Float = 1.0)
	toggleNodeMenu: function(position, zoom = 1.0) {
		let menu = this._nodeMenu;
		if (position === undefined) {
			menu.classList.add("invisible");			
			menu.style.left = "-100px";	// move it somewhere out of clickable area
			menu.style.top = "-100px";
		} else {
			menu.classList.remove("invisible");
			menu.style.left = position[0] + "px";
			menu.style.top = position[1] + "px";
			// Scale applies current zoom, translate ensures the middle point of menu is 
			// actually at postion [left, top] (this makes it easier to align).
			menu.style.transform = "scale(" + zoom + ") translate(-50%, -50%)";			
		}			
	},

	// Show the edge menu at the specified position with the provided data { observability, monotonicity }
	// If data or position is indefined, hide menu.
	toggleEdgeMenu(data, position, zoom = 1.0) {
		let menu = this._edgeMenu;
		if (position === undefined || data === undefined) {
			menu.classList.add("invisible");
			menu.style.left = "-100px";	// move it somewhere out of clickable area
			menu.style.top = "-100px";
		} else {
			menu.classList.remove("invisible");
			menu.style.left = position[0] + "px";
			menu.style.top = (position[1] + (75 * zoom)) + "px";
			// Scale applies current zoom, translate ensures the middle point of menu is 
			// actually at postion [left, top] (this makes it easier to align).			
			menu.style.transform = "scale(" + zoom + ") translate(-50%, -50%)";
			menu.observabilityButton.updateState(data);
			menu.monotonicityButton.updateState(data);
		}
	},

	// Add a listener to each button to display hint texts when hovered.
	// For toggle buttons, add functions that enable actual toggling of the state value.
	_initEdgeMenu(menu) {
		// make hint work
		let hint = menu.getElementsByClassName("hint")[0];
		let buttons = menu.getElementsByClassName("button");
		for (var i = 0; i < buttons.length; i++) {
			let button = buttons[i];
			button.addEventListener("mouseenter", (e) => {
				hint.textContent = button.alt;
				hint.classList.remove("invisible");
			});
			button.addEventListener("mouseleave", (e) => {
				hint.classList.add("invisible");
			});
		}
		// Make observability button react to regulation state:
		let observability = document.getElementById("edge-menu-observability");
		observability.updateState = function(data) {
			let state = "off";
			if (data.observable) state = "on";
			if (state != observability.getAttribute("state")) {
				observability.setAttribute("state", state);
				observability.alt = observability.getAttribute("alt-"+state);
				observability.src = observability.getAttribute("src-"+state);
				// if the hint is visible, it must be showing alt of this button (because the value just changed)
				hint.textContent = observability.alt;
			}			
		};
		observability.addEventListener("click", (e) => {
			let selected = CytoscapeEditor.getSelectedRegulationPair();
			if (selected !== undefined) {
				LiveModel.toggleObservability(selected.regulator, selected.target);				
			}
		});
		menu.observabilityButton = observability;
		let monotonicity = document.getElementById("edge-menu-monotonicity");
		monotonicity.updateState = function(data) {		
			if (monotonicity.getAttribute("state") != data.monotonicity) {
				monotonicity.alt = monotonicity.getAttribute("alt-"+data.monotonicity);
				monotonicity.src = monotonicity.getAttribute("src-"+data.monotonicity);
				monotonicity.setAttribute("state", data.monotonicity);
				// if the hint is visible, it must be showing alt of this button (because the value just changed)
				hint.textContent = monotonicity.alt;
			}				
		};
		monotonicity.addEventListener("click", (e) => {
			let selected = CytoscapeEditor.getSelectedRegulationPair();
			if (selected !== undefined) {
				LiveModel.toggleMonotonicity(selected.regulator, selected.target);
			}
		});
		menu.monotonicityButton = monotonicity;
		let removeButton = document.getElementById("edge-menu-remove");
		removeButton.addEventListener("click", (e) => {
			let selected = CytoscapeEditor.getSelectedRegulationPair();
			if (selected !== undefined) {
				LiveModel.removeRegulation(selected.regulator, selected.target);
			}
		});
	},

	// Add a listener to each button which displays its alt as hint text when hovered
	// and make the buttons actually clickable with actions.
	_initNodeMenu: function(menu) {
		// make hint work
		let hint = menu.getElementsByClassName("hint")[0];
		let buttons = menu.getElementsByClassName("button");		
		for (var i = 0; i < buttons.length; i++) {
			let button = buttons[i];
			button.addEventListener("mouseenter", (e) => {			
				hint.textContent = button.alt;
				hint.classList.remove("invisible");
			});
			button.addEventListener("mouseleave", (e) => {
				hint.classList.add("invisible");
			});
		}
		// Remove node button
		let removeButton = document.getElementById("node-menu-remove");
		removeButton.addEventListener("click", (e) => {
			let selectedNodeId = CytoscapeEditor.getSelectedNodeId();
			if (selectedNodeId !== undefined) {
				LiveModel.removeVariable(selectedNodeId);
			}
		});
		// Edit node name button
		let editNameButton = document.getElementById("node-menu-edit-name");
		editNameButton.addEventListener("click", (e) => {
			let selectedNodeId = CytoscapeEditor.getSelectedNodeId();
			if (selectedNodeId !== undefined) {
				ModelEditor.focusNameInput(selectedNodeId);
			}
		});
	},

	// Add a hover listener to all side menu items to show hint when needed.
	// Add a click listener that will toggle the appropriate tab for each button.
	_initSideMenu: function(menu) {
		let groups = menu.getElementsByClassName("button-group");
		for (var i = 0; i < groups.length; i++) {
			let group = groups[i];			
			let button = group.getElementsByClassName("button")[0];
			let hint = group.getElementsByClassName("hint")[0];
			let tabId = button.getAttribute("tab-id");
			// Show hint popup on mouse enter when button is not selected.
			button.addEventListener("mouseenter", (e) => {
				let selected = button.classList.contains("selected");
				if (!selected) {
					group.style.width = "272px";
					hint.classList.remove("invisible");
				}				
			});
			// Hide hint popup on mouse leave
			button.addEventListener("mouseleave", (e) => {
				group.style.width = "72px";				
				hint.classList.add("invisible");			
			});
			// On click, if selected, close content. If not selected, switch to this tab.
			button.addEventListener("click", (e) => {
				let selected = button.classList.contains("selected");
				if (selected) {
					UI.closeContent();
				} else {
					UI.ensureContentTabOpen(tabId);
					// Also, hide the hint popup
					group.style.width = "72px";
					hint.classList.add("invisible");
				}				
			});
		}
	},
	
}
