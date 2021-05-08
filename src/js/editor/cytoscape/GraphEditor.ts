import cytoscape, { NodeSingular } from 'cytoscape';
import GraphEditorStyle from './styles';
import Config from '../../core/Config';
import EdgeHandlesDefault from './edgehandles';

// Import and apply cytoscape plugins.
import edgehandles from 'cytoscape-edgehandles';
import coseBilkent from 'cytoscape-cose-bilkent';
import dagre from 'cytoscape-dagre';
import collapse from 'cytoscape-expand-collapse';
import Model, { Position, LiveModel } from '../LiveModel';

// The typescript declaration for plugin objects is messed up 
// for some reason, but this works just fine.
cytoscape.use((edgehandles as unknown) as cytoscape.Ext);
cytoscape.use((coseBilkent as unknown) as cytoscape.Ext);
cytoscape.use((dagre as unknown) as cytoscape.Ext);
cytoscape.use((collapse as unknown) as cytoscape.Ext);

// Some sensible default values for graph layout.
let DefaultLayout: cytoscape.LayoutOptions = {
    animate: true,
    animationDuration: 300,
    refresh: 20,
    fit: true,
    name: 'cose',
    padding: (Math.max(window.innerWidth, window.innerHeight) * 0.1),
    nodeOverlap: 10,
    nodeDimensionsIncludeLabels: true,
}

/**
 * Manages one cytoscape editor which represents the Boolean network
 * regulatory graph.
 */
export class GraphEditor {
    /**
     * HTML element holding the cytoscape editor.
     */
    container: HTMLElement
    /**
     * Reference to the cytoscape singleton.
     */
    cytoscape: cytoscape.Core  
    /**
     * Reference to the edgehandles plugin singleton.
     */
    edgehandles: cytoscape.EdgeHandlesApi
    /**
     * Reference to the expand-collapse plugin singleton.
     */
    expandCollapse: any  
    /**
     * Used to detect double clicks.
     */
    lastClicked: number = 0

    constructor(container: HTMLElement, model: LiveModel) {
        this.container = container;
        this.cytoscape = cytoscape({
            container: container,
            layout: DefaultLayout,
            boxSelectionEnabled: true,
            style: GraphEditorStyle,
        });
        this.edgehandles = this.cytoscape.edgehandles(EdgeHandlesDefault);
        this.expandCollapse = (this.cytoscape as any).expandCollapse();

        if (Config.DEBUG_MODE) {
            (window as any).cytoscape = this;
        }
        
        registerInternalEvents(this, model);
    }

    getSelectedVariables(): string[] {
        let selection: string[] = [];
		this.cytoscape.$("node[type='variable']:selected").forEach((node) => { 
            selection.push(node.id()); 
        });
		return selection;
    }

    getSelectedRegulations(): [string, string][] {
        let selection: [string, string][] = [];
		this.cytoscape.$("edge:selected").forEach((edge) => {
			selection.push([edge.source().id(), edge.target().id()]);
		})		
		return selection;
    }

    renderMenus() {
        // TODO
    }

    fitViewport() {
        // The padding we want to apply is 10% of the larger viewport dimension.
		let padding = 0.1 * Math.max(window.innerWidth, window.innerHeight);
		this.cytoscape.animate({
			fit: {
				eles: this.cytoscape.elements(),
				padding: padding
			},
			duration: 200,
		});
    }

    /**
     * Compute *some* position that can be used to place a node such
     * that the node will be visible.
     */
    nextFreePosition(): Position {
        let right_most: Position = { x: 0, y: 0 };
        this.cytoscape.$('node[type = "variable"]').forEach((node) => {
            let position = node.position();
            if (position.x > right_most.x) {
                right_most = position;
            }
        });		
        return { x: right_most.x + 40, y: right_most.y + 40 };        
    }

}

/**
 * Register listeners to internal cytoscape events.
 */
function registerInternalEvents(editor: GraphEditor, model: LiveModel) {  
    let cy = editor.cytoscape;
    {	// Init mouse events to show pointer cursor and trigger hover events.

        cy.on('mouseover', 'node.eh-handle', function() {
            document.body.style.cursor = "pointer";
        });

        cy.on('mouseout', 'node.eh-handle', function() {
            document.body.style.cursor = "auto";
        });

        cy.on('mouseover', 'node[type = "variable"]', function(event) {
            document.body.style.cursor = "pointer";			
            model.hoverVariable((event.target as NodeSingular).id(), true);            
        });

        cy.on('mouseout', 'node[type = "variable"]', function(event) {
            document.body.style.cursor = "auto";
            model.hoverVariable((event.target as NodeSingular).id(), false);            
        });

        cy.on('mouseover', 'edge', function(event) {
            document.body.style.cursor = "pointer";
            let edge = event.target as cytoscape.EdgeSingular;
            model.hoverRegulation(edge.source().id(), edge.target().id(), true);
        });

        cy.on('mouseout', 'edge', function(event) {
            document.body.style.cursor = "auto";
            let edge = event.target as cytoscape.EdgeSingular;
            model.hoverRegulation(edge.source().id(), edge.target().id(), false);
        });	
    }
    
    {	// Mark pressed and dragged variables with a class so they can be styled separately.
        cy.on('mousedown', 'node[type = "variable"]', function(event) {
            (event.target as cytoscape.NodeSingular).addClass("pressed");				
        });

        cy.on('mouseup', 'node[type = "variable"]', function(event) {
            (event.target as cytoscape.NodeSingular).removeClass("pressed");				
        });

        cy.on('drag', 'node[type = "variable"]', function(event) {
            (event.target as cytoscape.NodeSingular).addClass("dragged");				
        });

        cy.on('dragfree', 'node[type = "variable"]', function(event) {
            (event.target as cytoscape.NodeSingular).removeClass("dragged");
        })
    }

    {	// When an element is selected/unselected, also emit global events.
        let selection_handler = function() {
            let variables = editor.getSelectedVariables();
            let regulations = editor.getSelectedRegulations();
            model.selection(variables, regulations);            
        };

        cy.on('select', selection_handler);
        cy.on('unselect', selection_handler);
    }

    {	// When the visibility of the graph changes, trigger menu position re-calculation.
        let callback = function() { editor.renderMenus() };
        cy.on('zoom', callback);
        cy.on('pan', callback);
        cy.on('drag', callback);
        cy.on('select', callback);
        cy.on('unselect', callback);
    }

    { 	// Unless anything other than a node is hovered, we want to remove edge handles.
        cy.on('mousemove', (event) => {									
            if (event.target.length === undefined || event.target.length == 0) {
                editor.edgehandles.hide();
            } else {
                let element = event.target[0] as cytoscape.Singular;
                if (element.group() !== "nodes") {
                    editor.edgehandles.hide();                    
                }
            }			
        });
    }	
    
    {	// Detect double clicks and trigger variable creation for them.
        cy.on('click', (event) => {
            let original_event = event.originalEvent;
            if (original_event.getModifierState("Ctrl") ||
                original_event.getModifierState("Shift") ||
                original_event.getModifierState("Alt") ||
                original_event.getModifierState("Fn") ||
                original_event.getModifierState("Hyper") ||
                original_event.getModifierState("OS") ||
                original_event.getModifierState("Super") ||
                original_event.getModifierState("Win")) {
                return;	// Ignore click if it has some modifier key set.
            }
            if (event.target.length === undefined || event.target.length == 0) {
                // Only triggered when clicked into empty space.
                let now = (new Date()).getTime();
                if (now - editor.lastClicked < Config.CONSTANTS.DOUBLE_CLICK_DELAY) {
                    model.ensureVariable({
                        position: editor.nextFreePosition(),
                    });
                }
                editor.lastClicked = now;
            }				
        });			
    }
}

let modelEditor = new GraphEditor(document.getElementById("editor-cytoscape"), Model);
export default modelEditor;