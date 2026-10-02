/* =========================================================
   BUGAI — KNOWLEDGE BASE GROWTH
   Milestone 4

   Responsibilities:
   - Firebase authentication
   - Read submitted bugs from Firestore
   - Populate Bug ID selector
   - Auto-fill confirmed-fix form
   - Validate confirmation / approval
   - Send confirmed fix to Flask KB Growth API
   - Mobile sidebar

   Data:
   - Submitted bugs → Firebase Firestore
   - KB indexing → Flask backend
   - No localStorage
========================================================= */


/* =========================================================
   FIREBASE
========================================================= */

import {
    auth,
    db,
    collection,
    getDocs,
    onAuthStateChanged
} from "../firebase.js";


/* =========================================================
   CONFIGURATION
========================================================= */

const API_BASE_URL =
    "http://127.0.0.1:5000";


const BUG_COLLECTION =
    "bugSubmissions";


/* =========================================================
   STATE
========================================================= */

let submittedBugRecords = [];

let selectedSubmittedBug = null;

let growthLoading = false;


/* =========================================================
   FIREBASE AUTH
========================================================= */

function waitForFirebaseAuth() {

    return new Promise(
        (resolve, reject) => {

            let completed = false;


            const unsubscribe =
                onAuthStateChanged(

                    auth,

                    (user) => {

                        if (completed) {
                            return;
                        }


                        completed = true;

                        unsubscribe();


                        if (!user) {

                            reject(
                                new Error(
                                    "No authenticated Firebase user found."
                                )
                            );

                            return;
                        }


                        console.log(
                            "✅ Firebase authentication ready:",
                            user.uid
                        );


                        resolve(user);

                    },


                    (error) => {

                        if (completed) {
                            return;
                        }


                        completed = true;

                        unsubscribe();


                        reject(error);

                    }

                );

        }
    );

}


/* =========================================================
   API REQUEST
========================================================= */

async function apiRequest(
    endpoint,
    options = {}
) {

    const url =
        `${API_BASE_URL}${endpoint}`;


    try {

        const response =
            await fetch(
                url,
                {
                    cache: "no-store",
                    ...options,

                    headers: {

                        "Content-Type":
                            "application/json",

                        ...(options.headers || {})

                    }

                }
            );


        const responseText =
            await response.text();


        let data = {};


        if (responseText.trim()) {

            try {

                data =
                    JSON.parse(
                        responseText
                    );

            } catch (error) {

                throw new Error(
                    `Invalid JSON response from ${endpoint}`
                );

            }

        }


        if (!response.ok) {

            throw new Error(

                data.error ||

                data.message ||

                `Request failed with status ${response.status}`

            );

        }


        return data;


    } catch (error) {

        if (
            error instanceof TypeError
        ) {

            throw new Error(
                "Cannot connect to BugAI backend. " +
                "Make sure Flask is running on port 5000."
            );

        }


        throw error;

    }

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }


    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   SET TEXT
========================================================= */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (!element) {
        return;
    }


    element.textContent =
        value === null ||
        value === undefined
            ? ""
            : String(value);

}


/* =========================================================
   FIREBASE STATUS
========================================================= */

function setFirebaseStatus(
    type,
    message
) {

    const element =
        document.getElementById(
            "firebaseStatus"
        );


    if (!element) {
        return;
    }


    element.textContent =
        message;


    element.className =
        "status-badge";


    if (type === "success") {

        element.classList.add(
            "success"
        );

    }

    else if (type === "warning") {

        element.classList.add(
            "warning"
        );

    }

    else if (type === "error") {

        element.classList.add(
            "error"
        );

    }

}


/* =========================================================
   RESULT MESSAGE
========================================================= */

function setResult(
    message,
    type = ""
) {

    const result =
        document.getElementById(
            "growthResult"
        );


    if (!result) {
        return;
    }


    result.className =
        "result-box";


    if (type) {

        result.classList.add(
            type
        );

    }


    result.textContent =
        message;

}


/* =========================================================
   LOAD SUBMITTED BUGS FROM FIREBASE
========================================================= */

async function loadSubmittedBugsFromFirebase() {

    const select =
        document.getElementById(
            "gBugId"
        );


    if (!select) {
        return;
    }


    select.disabled = true;


    select.innerHTML = `

        <option
            value=""
            selected
            disabled
        >
            Loading submitted bugs...
        </option>

    `;


    try {

        await waitForFirebaseAuth();


        setFirebaseStatus(
            "",
            "Firebase: Loading..."
        );


        console.log(
            "🔥 Reading bugSubmissions from Firebase..."
        );


        const snapshot =
            await getDocs(
                collection(
                    db,
                    BUG_COLLECTION
                )
            );


        submittedBugRecords =
            snapshot.docs.map(
                documentSnapshot => ({

                    id:
                        documentSnapshot.id,

                    ...documentSnapshot.data()

                })
            );


        console.log(
            "🔥 Firebase submitted bugs:",
            submittedBugRecords.length
        );


        setFirebaseStatus(
            "success",
            `Firebase: ${submittedBugRecords.length} bugs`
        );


        populateBugIdSelector();


    } catch (error) {

        console.error(
            "❌ Firebase submitted bugs error:",
            error
        );


        submittedBugRecords = [];


        setFirebaseStatus(
            "error",
            "Firebase: Error"
        );


        select.innerHTML = `

            <option
                value=""
                selected
                disabled
            >
                Unable to load submitted bugs
            </option>

        `;


        select.disabled = true;


        setResult(
            error.message,
            "result-error"
        );

    }

}


/* =========================================================
   GET BUG ID
========================================================= */

function getBugId(
    bug
) {

    return String(

        bug?.bug_id ??

        bug?.bugId ??

        bug?.id ??

        ""

    ).trim();

}


/* =========================================================
   GET BUG TITLE
========================================================= */

function getBugTitle(
    bug
) {

    return String(

        bug?.title ??

        bug?.bug_title ??

        bug?.summary ??

        "Submitted Bug"

    ).trim();

}


/* =========================================================
   GET PROJECT
========================================================= */

function getBugProject(
    bug
) {

    return String(

        bug?.project ??

        bug?.project_name ??

        ""

    ).trim();

}


/* =========================================================
   POPULATE BUG ID SELECTOR
========================================================= */

function populateBugIdSelector() {

    const select =
        document.getElementById(
            "gBugId"
        );


    if (!select) {
        return;
    }


    select.innerHTML = "";


    const placeholder =
        document.createElement(
            "option"
        );


    placeholder.value = "";


    placeholder.textContent =

        submittedBugRecords.length

            ? "Select a submitted bug"

            : "No submitted bugs available";


    placeholder.disabled =
        submittedBugRecords.length > 0;


    placeholder.selected = true;


    select.appendChild(
        placeholder
    );


    const usedIds =
        new Set();


    submittedBugRecords.forEach(
        (bug, index) => {

            const bugId =
                getBugId(bug);


            if (
                !bugId ||
                usedIds.has(bugId)
            ) {

                return;

            }


            usedIds.add(
                bugId
            );


            const option =
                document.createElement(
                    "option"
                );


            option.value =
                bugId;


            const title =
                getBugTitle(bug);


            const project =
                getBugProject(bug);


            option.textContent =

                project

                    ? `${bugId} — ${title} (${project})`

                    : `${bugId} — ${title}`;


            option.dataset.index =
                String(index);


            select.appendChild(
                option
            );

        }
    );


    select.disabled =
        submittedBugRecords.length === 0;


    selectedSubmittedBug =
        null;


    clearGrowthFields();


    if (
        submittedBugRecords.length > 0
    ) {

        setResult(
            "Select a submitted bug to begin."
        );

    }

}


/* =========================================================
   FIND SUBMITTED BUG
========================================================= */

function findSubmittedBug(
    bugId
) {

    return submittedBugRecords.find(
        bug => {

            return (
                getBugId(bug) ===
                String(bugId).trim()
            );

        }
    ) || null;

}


/* =========================================================
   BUG SELECTION
========================================================= */

function handleSubmittedBugSelection(
    event
) {

    const bugId =
        String(
            event.target.value || ""
        ).trim();


    if (!bugId) {

        selectedSubmittedBug =
            null;

        clearGrowthFields();

        setResult(
            "Select a submitted bug to begin."
        );

        return;

    }


    selectedSubmittedBug =
        findSubmittedBug(
            bugId
        );


    if (!selectedSubmittedBug) {

        selectedSubmittedBug =
            null;

        clearGrowthFields();


        setResult(
            "Selected submitted bug could not be found.",
            "result-error"
        );


        return;

    }


    fillGrowthFields(
        selectedSubmittedBug
    );

}


/* =========================================================
   SET GROWTH FIELD
========================================================= */

function setGrowthField(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (!element) {
        return;
    }


    element.value =

        value === null ||
        value === undefined

            ? ""

            : String(value);

}


/* =========================================================
   GET FIELD VALUE
========================================================= */

function getValue(
    object,
    keys
) {

    for (
        const key of keys
    ) {

        const value =
            object?.[key];


        if (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        ) {

            return value;

        }

    }


    return "";

}


/* =========================================================
   FILL GROWTH FORM
========================================================= */

function fillGrowthFields(
    bug
) {

    if (!bug) {
        return;
    }


    setGrowthField(
        "gBugId",
        getBugId(bug)
    );


    setGrowthField(
        "gProject",
        getValue(
            bug,
            [
                "project",
                "project_name"
            ]
        )
    );


    setGrowthField(
        "gTitle",
        getValue(
            bug,
            [
                "title",
                "bug_title",
                "summary"
            ]
        )
    );


    setGrowthField(
        "gDescription",
        getValue(
            bug,
            [
                "description",
                "bug_description"
            ]
        )
    );


    setGrowthField(
        "gComponent",
        getValue(
            bug,
            [
                "affected_component",
                "component"
            ]
        )
    );


    setGrowthField(
        "gStack",
        getValue(
            bug,
            [
                "stack_trace",
                "error_information",
                "error_message",
                "log"
            ]
        )
    );


    setGrowthField(
        "gRoot",
        getValue(
            bug,
            [
                "root_cause",
                "hypothesis",
                "rootCause"
            ]
        )
    );


    setGrowthField(
        "gResolution",
        getValue(
            bug,
            [
                "resolution",
                "recommended_fix",
                "recommendedFix"
            ]
        )
    );


    setGrowthField(
        "gSeverity",
        getValue(
            bug,
            [
                "severity"
            ]
        )
    );


    setGrowthField(
        "gPriority",
        getValue(
            bug,
            [
                "priority"
            ]
        )
    );


    /* =====================================================
       MANUAL CONFIRMATION
    ====================================================== */

    const confirmed =
        document.getElementById(
            "confirmedFix"
        );


    const approved =
        document.getElementById(
            "approved"
        );


    if (confirmed) {

        confirmed.checked =
            false;

    }


    if (approved) {

        approved.checked =
            false;

    }


    const bugId =
        getBugId(bug);


    setResult(

        `Selected submitted bug: ${bugId}\n\n` +

        "Review the populated information, " +

        "confirm the fix, approve it for the KB, " +

        "then click Validate & Add to Knowledge Base."

    );

}


/* =========================================================
   CLEAR GROWTH FIELDS
========================================================= */

function clearGrowthFields() {

    const ids = [

        "gProject",

        "gTitle",

        "gDescription",

        "gComponent",

        "gStack",

        "gRoot",

        "gResolution",

        "gSeverity",

        "gPriority"

    ];


    ids.forEach(
        id => {

            const element =
                document.getElementById(
                    id
                );


            if (element) {

                element.value =
                    "";

            }

        }
    );


    const confirmed =
        document.getElementById(
            "confirmedFix"
        );


    const approved =
        document.getElementById(
            "approved"
        );


    if (confirmed) {

        confirmed.checked =
            false;

    }


    if (approved) {

        approved.checked =
            false;

    }

}


/* =========================================================
   VERIFY SELECTED BUG
========================================================= */

function verifySelectedSubmittedBug() {

    if (!selectedSubmittedBug) {

        throw new Error(
            "Please select an existing submitted bug first."
        );

    }


    const id =
        getBugId(
            selectedSubmittedBug
        );


    if (!id) {

        throw new Error(
            "The selected submitted bug does not have a valid Bug ID."
        );

    }


    const exists =
        submittedBugRecords.some(
            bug =>
                getBugId(bug) === id
        );


    if (!exists) {

        throw new Error(
            "The selected Bug ID is not present in Firebase submitted records."
        );

    }


    return id;

}


/* =========================================================
   COLLECT GROWTH PAYLOAD
========================================================= */

function collectGrowthPayload() {

    const verifiedBugId =
        verifySelectedSubmittedBug();


    return {

        bug_id:
            verifiedBugId,


        project:
            document.getElementById(
                "gProject"
            )?.value.trim() || "",


        title:
            document.getElementById(
                "gTitle"
            )?.value.trim() || "",


        description:
            document.getElementById(
                "gDescription"
            )?.value.trim() || "",


        component:
            document.getElementById(
                "gComponent"
            )?.value.trim() || "",


        stack_trace:
            document.getElementById(
                "gStack"
            )?.value.trim() || "",


        root_cause:
            document.getElementById(
                "gRoot"
            )?.value.trim() || "",


        resolution:
            document.getElementById(
                "gResolution"
            )?.value.trim() || "",


        severity:
            document.getElementById(
                "gSeverity"
            )?.value || "",


        priority:
            document.getElementById(
                "gPriority"
            )?.value || "",


        confirmed_fix:
            document.getElementById(
                "confirmedFix"
            )?.checked === true,


        approved:
            document.getElementById(
                "approved"
            )?.checked === true

    };

}


/* =========================================================
   VALIDATE PAYLOAD
========================================================= */

function validateGrowthPayload(
    payload
) {

    const required = [

        [
            "title",
            "Title is missing from the selected bug."
        ],

        [
            "component",
            "Affected Component is required."
        ],

        [
            "description",
            "Description is required."
        ],

        [
            "stack_trace",
            "Error Information / Stack Trace is required."
        ],

        [
            "root_cause",
            "Confirmed Root Cause is required."
        ],

        [
            "resolution",
            "Confirmed Resolution / Fix is required."
        ]

    ];


    for (
        const [field, message]
        of required
    ) {

        if (
            !payload[field]
        ) {

            throw new Error(
                message
            );

        }

    }


    if (
        !payload.confirmed_fix
    ) {

        throw new Error(
            "The 'Confirmed fix' checkbox must be selected."
        );

    }


    if (
        !payload.approved
    ) {

        throw new Error(
            "The 'Approved for KB' checkbox must be selected."
        );

    }

}


/* =========================================================
   SUBMIT KNOWLEDGE BASE GROWTH
========================================================= */

async function submitGrowth() {

    if (growthLoading) {
        return;
    }


    growthLoading = true;


    const button =
        document.getElementById(
            "addGrowth"
        );


    if (button) {

        button.disabled =
            true;

        button.textContent =
            "Validating...";

    }


    setResult(
        "Validating selected submitted bug...",
        "loading"
    );


    try {

        /* =================================================
           VERIFY FIREBASE AUTH
        ================================================== */

        await waitForFirebaseAuth();


        /* =================================================
           COLLECT PAYLOAD
        ================================================== */

        const payload =
            collectGrowthPayload();


        /* =================================================
           VALIDATE
        ================================================== */

        validateGrowthPayload(
            payload
        );


        /* =================================================
           SEND TO BACKEND
        ================================================== */

        setResult(
            `Adding confirmed fix for ${payload.bug_id}...`,
            "loading"
        );


        const response =
            await apiRequest(
                "/api/knowledge-base/growth",
                {
                    method: "POST",

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );


        /* =================================================
           SUCCESS
        ================================================== */

        setResult(

            JSON.stringify(
                response,
                null,
                2
            ),

            "result-success"

        );


        console.log(
            "✅ Knowledge base growth completed:",
            response
        );


    } catch (error) {

        console.error(
            "❌ Knowledge base growth error:",
            error
        );


        setResult(
            error.message,
            "result-error"
        );


    } finally {

        growthLoading =
            false;


        if (button) {

            button.disabled =
                false;

            button.textContent =
                "Validate & Add to Knowledge Base";

        }

    }

}


/* =========================================================
   MOBILE SIDEBAR
========================================================= */

function setupMobileSidebar() {

    const sidebar =
        document.getElementById(
            "bugaiSidebar"
        );


    const menuButton =
        document.getElementById(
            "sidebarMenuButton"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    if (
        !sidebar ||
        !menuButton ||
        !overlay
    ) {

        return;

    }


    function openSidebar() {

        sidebar.classList.add(
            "open"
        );

        overlay.classList.add(
            "open"
        );

        menuButton.setAttribute(
            "aria-expanded",
            "true"
        );

    }


    function closeSidebar() {

        sidebar.classList.remove(
            "open"
        );

        overlay.classList.remove(
            "open"
        );

        menuButton.setAttribute(
            "aria-expanded",
            "false"
        );

    }


    menuButton.addEventListener(
        "click",
        () => {

            const isOpen =
                sidebar.classList.contains(
                    "open"
                );


            if (isOpen) {

                closeSidebar();

            } else {

                openSidebar();

            }

        }
    );


    overlay.addEventListener(
        "click",
        closeSidebar
    );


    sidebar
        .querySelectorAll(
            ".sidebar-link"
        )
        .forEach(
            link => {

                link.addEventListener(
                    "click",
                    closeSidebar
                );

            }
        );


    document.addEventListener(
        "keydown",

        event => {

            if (
                event.key ===
                "Escape"
            ) {

                closeSidebar();

            }

        }
    );

}


/* =========================================================
   SELECT CHANGE LISTENER
========================================================= */

function setupBugSelector() {

    const select =
        document.getElementById(
            "gBugId"
        );


    if (!select) {
        return;
    }


    select.addEventListener(
        "change",
        handleSubmittedBugSelection
    );

}


/* =========================================================
   BUTTON
========================================================= */

function setupGrowthButton() {

    const button =
        document.getElementById(
            "addGrowth"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        submitGrowth
    );

}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",

    async () => {

        console.log(
            "🚀 BugAI Knowledge Base Growth loading..."
        );


        /* -------------------------------------------------
           MOBILE SIDEBAR
        ------------------------------------------------- */

        setupMobileSidebar();


        /* -------------------------------------------------
           BUG SELECTOR
        ------------------------------------------------- */

        setupBugSelector();


        /* -------------------------------------------------
           GROWTH BUTTON
        ------------------------------------------------- */

        setupGrowthButton();


        /* -------------------------------------------------
           LOAD FIREBASE DATA
        ------------------------------------------------- */

        await loadSubmittedBugsFromFirebase();


        console.log(
            "✅ BugAI Knowledge Base Growth initialized."
        );

    }

);