/*
* Title: access scope table
*
* Goals:
* 1. Demonstrate communication maturity: think aloud and ask questions.
* 2. Demonstrate problem solving: probe the problem and design a solution.
* 3. Demonstrate JavaScript ability: display information (but without React).
*
* Scenario: In a form to configure role-based access control
* for objects in a hierarchical parent-child relationship,
* administrators need to receive visual feedback about the access scope
* whenever they change the selection of a parent or child object.
*
* For example, access scope by cluster and namespace in Kubernetes.
*
* The client page renders a tree table which combines the following information:
* 1. computed access scope array from response to request made in onChange handler
* 2. selections object in client form state (initialized from a server request)
* 3. filter criteria object in client page state (Part 3, if time permits)
*
* Objective: Write a pure function (and at least one helper function)
* to format lines of output which represent the props and text
* that you would need to render parent and child rows in a tree table,
* given the following as input:
* 1. computed access scope array, as if from response to request
* 2. selections object
* 3. filter criteria object (Part 3, if time permits)
*
* For your info, here are rules by which the server computes access scope:
* 1a. If parent is selected, then its state is INCLUDED.
* 1b. If child is selected, then its parent state is HIERARCHICALLY_INCLUDED (unless 1a).
* 2a. If child is selected, then its state is INCLUDED.
* 2b. If parent is selected, then its children state is HIERARCHICALLY_INCLUDED (unless 2a). 
*/

// Part 1

/*
* Example of parents and children with selections:
* parentA
*   childA
*   childB is selected
*   childC
* parentB
*   childA
* parentC is selected
*   childA is selected
*   ChildB
*
* Data structure for selections in client form state and server requests:
* selectedParents: array of strings: name of selected parent (unique)
* selectedChildren: array of array tuples: names of selected child (not unique) and its parent
*
* By the way, name instead of id is an intentional decision for selections
* because users might delete, and then re-create secured clusters.
*
* For example, here are previously selected objects that are not in the current environment:
* selectedParents: 'parentD'
* selectedChildren: ['childB', 'parentB']
*/
const selectedInput1 = {
  selectedParents: ['parentC', 'parentD'],
  selectedChildren: [
    ['childB', 'parentA'],
    ['childB', 'parentB'],
    ['childA', 'parentC'],
  ],
};

/*
* Example of response from request to compute access scope for selectedInput1.
* id: unique for each object
* name: unique among parents; unique among children of a parent, but not among all children
* state:
* 1. INCLUDED if object is selected
* 2. HIERARCHICALLY_INCLUDED for parent if at least one of its children is selected (unless 1)
*                            for child if its parent is selected (unless 1)
* 3. NOT_INCLUDED if none of the above
*/
const computedInput1 = [
  {
    id: '37e37fbe',
    name: 'parentA',
    state: 'HIERARCHICALLY_INCLUDED',
    children: [
      {
        id: '0b129f84',
        name: 'childA',
        state: 'NOT_INCLUDED',
      },
      {
        id: '0b129f85',
        name: 'childB',
        state: 'INCLUDED',
      },
      {
        id: '0b129f86',
        name: 'childC',
        state: 'NOT_INCLUDED',
      },
    ],
  },
  {
    id: '37e37fbc',
    name: 'parentB',
    state: 'NOT_INCLUDED',
    children: [
      {
        id: '72f3cc63',
        name: 'childA',
        state: 'NOT_INCLUDED',
      },
    ],
  },
  {
    id: '37e37fba',
    name: 'parentC',
    state: 'INCLUDED',
    children: [
      {
        id: '4a560d7c',
        name: 'childA',
        state: 'INCLUDED',
      },
      {
        id: '4a560d7a',
        name: 'childB',
        state: 'HIERARCHICALLY_INCLUDED',
      },
    ],
  },
];

/*
* Example of output array for computedInput1 and selectedInput1.
* It has a string for each parent or child in computed access scope.
* It also includes selections (see selectedSymbol).
*
* id
* aria-level: one-based depth in tree table
* aria-posinset: one-based index of object among its siblings in tree table
* aria-setsize: number of children for a parent
* includedSymbol: + if INCLUDED or HIERARCHICALLY_INCLUDED; otherwise -
* selectedSymbol: + if in selections; otherwise -
* name
*/
const expectedOutputLines1 = [
  '37e37fbe aria-level=1 aria-posinset=1 aria-setsize=3 + - parentA',
  '0b129f84 aria-level=2 aria-posinset=1 aria-setsize=0 - - childA',
  '0b129f85 aria-level=2 aria-posinset=2 aria-setsize=0 + + childB',
  '0b129f86 aria-level=2 aria-posinset=3 aria-setsize=0 - - childC',
  '37e37fbc aria-level=1 aria-posinset=2 aria-setsize=1 - - parentB',
  '72f3cc63 aria-level=2 aria-posinset=1 aria-setsize=0 - - childA',
  '37e37fba aria-level=1 aria-posinset=3 aria-setsize=2 + + parentC',
  '4a560d7c aria-level=2 aria-posinset=1 aria-setsize=0 + + childA',
  '4a560d7a aria-level=2 aria-posinset=2 aria-setsize=0 + - childB',
];

function formatOutputLines(computed, selected, filtered = {}, resolveSymb) {
  const lines = [];

  // filter array first to avoid process useless data
  // also we wont match wrong children data
  const dataToProcess = filterItemsByName(computed, 'parent', filtered.parentNameFilter);

  dataToProcess.forEach((parent, pIndex) => {
    // resolve parent line
    const pIncludedSymb = resolveIncludedSymbol(parent, resolveSymb);
    const pSelected = selected.selectedParents.includes(parent.name);
    lines.push(formatOutputLine(parent, pIndex, pIncludedSymb, pSelected));
    // resolve children lines. since we must preserve the aria-posinset
    // for filtered children we gonna do a post filter  
    parent.children.forEach((child, cIndex) => {
      const cIncludedSymb = resolveIncludedSymbol(child, resolveSymb);
      const cSelected =  selected.selectedChildren.some(item => {
        return item.includes(child.name) && item.includes(parent.name);
      });

      if (
        !filtered || 
        !Object.keys(filtered).length || 
        !filtered.childNameFilter || 
        (child.name === `child${filtered.childNameFilter}`)
      ) {
        lines.push(formatOutputLine(child, cIndex, cIncludedSymb, cSelected, 2));
      }
    })
  });

  return lines;
}

function filterItemsByName(items, prefix, itemName) {
  if (itemName) {
    const parentNameFilter = prefix + itemName;
    return items.filter(item => item.name === parentNameFilter);
  }

  return items;
}

function formatOutputLine(item, index, includedSymb, selected, level = 1) {
  const ariaLevel = `aria-level=${level}`;
  const ariaPostInset = `aria-posinset=${index + 1}`;
  const ariaSetSize = `aria-setsize=${item.children ? item.children.length : 0}`;
  const selectedSymbol = selected ? '+' : '-';
  
  return `${item.id} ${ariaLevel} ${ariaPostInset} ${ariaSetSize} ${includedSymb} ${selectedSymbol} ${item.name}`;
}

function resolveIncludedSymbol(computedItem, resolveSymb) {
  if (!resolveSymb) {
    return computedItem.state !== 'NOT_INCLUDED' ? '+' : '-';
  } else {
    const symbols = {
      INCLUDED: '+',
      NOT_INCLUDED: '-',
      HIERARCHICALLY_INCLUDED: '*',
    };

    return symbols[computedItem.state];
  }
}

function isItemSelected(item, selected) {
  return ;
}

function test(computedInput, selectedInput, filteredInput, expectedOutputLines, resolveSymb) {
  const receivedOutputLines = formatOutputLines(computedInput, selectedInput, filteredInput, resolveSymb);
  console.log(
    receivedOutputLines.join('\n') === expectedOutputLines.join('\n'),
    receivedOutputLines
    );
  }
  
  test(computedInput1, selectedInput1, {}, expectedOutputLines1);
  
  // Part 2
  //
  // Edit code for includedSymbol in output line which represent state as follows:
  // + if INCLUDED
  // * if HIERARCHICALLY_INCLUDED
  // - if NOT_INCLUDED
  //
  // Comment out the preceding test call and uncomment the following test call.
  
  const expectedOutputLines2 = [
    '37e37fbe aria-level=1 aria-posinset=1 aria-setsize=3 * - parentA',
    '0b129f84 aria-level=2 aria-posinset=1 aria-setsize=0 - - childA',
    '0b129f85 aria-level=2 aria-posinset=2 aria-setsize=0 + + childB',
    '0b129f86 aria-level=2 aria-posinset=3 aria-setsize=0 - - childC',
    '37e37fbc aria-level=1 aria-posinset=2 aria-setsize=1 - - parentB',
    '72f3cc63 aria-level=2 aria-posinset=1 aria-setsize=0 - - childA',
    '37e37fba aria-level=1 aria-posinset=3 aria-setsize=2 + + parentC',
    '4a560d7c aria-level=2 aria-posinset=1 aria-setsize=0 + + childA',
    '4a560d7a aria-level=2 aria-posinset=2 aria-setsize=0 * - childB',
  ];
  
  test(computedInput1, selectedInput1, {}, expectedOutputLines2, true);
  
  // Part 3, if time permits
  //
  // Edit formatOutputLines function so it matches objects as described below.
  // Uncomment the following test call.
  
  /*
  * Example of filter criteria in client page state.
  *
  * parentNameFilter: If property is falsey, parent object matches the filter;
  *                   otherwise parent object matches the filter if its name includes the substring;
  *                   If parent object does not match, its children do not match, so ignore child filter.
  *
  * childNameFilter:  If property is falsey, child object matches the filter;
  *                   otherwise child object matches the filter if its name includes the substring.
  */
  const filteredInput3 = {
    parentNameFilter: 'A',
    childNameFilter: 'C'
  };
  
  /*
  * Example of output array for computedInput1, selectedInput1, and filteredInput2.
  *
  * Administrators might filter the table to focus attention on certain objects.
  * Whether an object matches filter criteria does not affect computed access scope.
  */
  const expectedOutputLines3 = [
    '37e37fbe aria-level=1 aria-posinset=1 aria-setsize=3 * - parentA',
    '0b129f86 aria-level=2 aria-posinset=3 aria-setsize=0 - - childC',
  ];
  
  test(computedInput1, selectedInput1, filteredInput3, expectedOutputLines3, true);
  
  // Part 4, if time permits
  //
  // Write more test calls with inputs and expected outputs for edge cases


  /**
   * When filtering by inexistent parent name, no data must be returned
   */
  const expectedOutputLines4 = [];
  
  const filteredInput4 = {
    parentNameFilter: 'whatever',
  };
  
  test(computedInput1, selectedInput1, filteredInput4, expectedOutputLines4, true);
  
  
  /**
   * When filtering by inexistent child name, all parents must be returned, but no child
   */
   const expectedOutputLines5 = [
    '37e37fbe aria-level=1 aria-posinset=1 aria-setsize=3 * - parentA',
    '37e37fbc aria-level=1 aria-posinset=2 aria-setsize=1 - - parentB',
    '37e37fba aria-level=1 aria-posinset=3 aria-setsize=2 + + parentC'     
   ];
  
   const filteredInput5 = {
    childNameFilter: 'whatever',
   };
   
   test(computedInput1, selectedInput1, filteredInput5, expectedOutputLines5, true);
   
  