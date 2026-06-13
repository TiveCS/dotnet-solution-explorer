import {
  addSolutionFolder, addProjectEntry, renameEntry, renameProjectEntry, setNestedParent, removeEntry,
  newGuid, typeGuidForProjectFile, SLN_TYPE_GUIDS,
} from '../src/parser/slnWriter';

let failures = 0;
function check(name: string, cond: boolean) {
  if (!cond) { console.error('FAIL:', name); failures++; }
  else console.log('ok  :', name);
}

const APP = '{11111111-1111-1111-1111-111111111111}';
const FOLDER = '{22222222-2222-2222-2222-222222222222}';

// Minimal but realistic .sln (LF). Has configs but NO NestedProjects section.
const slnNoNested =
`Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.8.0.0
MinimumVisualStudioVersion = 10.0.40219.1
Project("${SLN_TYPE_GUIDS.csharp}") = "App", "App\\App.csproj", "${APP}"
EndProject
Global
\tGlobalSection(SolutionConfigurationPlatforms) = preSolution
\t\tDebug|Any CPU = Debug|Any CPU
\tEndGlobalSection
\tGlobalSection(ProjectConfigurationPlatforms) = postSolution
\t\t${APP}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
\tEndGlobalSection
EndGlobal
`;

// ── newGuid / typeGuid ──────────────────────────────────────────────────────
check('newGuid is braced upper-case', /^\{[0-9A-F-]{36}\}$/.test(newGuid()));
check('csproj type guid', typeGuidForProjectFile('a/B.csproj') === SLN_TYPE_GUIDS.csharp);
check('fsproj type guid', typeGuidForProjectFile('a/B.fsproj') === SLN_TYPE_GUIDS.fsharp);
check('vbproj type guid', typeGuidForProjectFile('a/B.vbproj') === SLN_TYPE_GUIDS.vbnet);

// ── addSolutionFolder ───────────────────────────────────────────────────────
let s = addSolutionFolder(slnNoNested, 'Build', FOLDER);
check('folder block inserted before Global', /Project\("\{2150E333[^"]*"\) = "Build", "Build", "\{22222222[^\n]*\nEndProject\nGlobal/.test(s));
check('folder uses solution-folder type guid', s.includes(`Project("${SLN_TYPE_GUIDS.solutionFolder}") = "Build", "Build", "${FOLDER}"`));
check('existing config sections preserved', s.includes('SolutionConfigurationPlatforms') && s.includes('ProjectConfigurationPlatforms'));

// ── setNestedParent: creates section when absent ────────────────────────────
let s2 = setNestedParent(s, APP, FOLDER);
check('NestedProjects section created', /GlobalSection\(NestedProjects\) = preSolution\n\t\t\{11111111[^\n]*= \{22222222[^\n]*\n\tEndGlobalSection/.test(s2));
check('nested section sits inside Global', s2.indexOf('NestedProjects') < s2.search(/^EndGlobal\r?$/m));

// ── setNestedParent: reuses existing section, replaces stale line ───────────
let s3 = setNestedParent(s2, APP, FOLDER); // idempotent-ish (re-parent to same)
check('no duplicate nesting line', (s3.match(/\{11111111-1111-1111-1111-111111111111\} = /g) || []).length === 1);
check('still single NestedProjects section', (s3.match(/GlobalSection\(NestedProjects\)/g) || []).length === 1);

// ── setNestedParent: clearing moves to root ─────────────────────────────────
let s4 = setNestedParent(s2, APP, undefined);
check('clearing removes nesting line', !s4.includes(`${APP} = ${FOLDER}`));

// ── renameEntry: solution folder rewrites both name and path ────────────────
let r = renameEntry(s, FOLDER, 'Tools', true);
check('folder rename updates name+path', r.includes(`= "Tools", "Tools", "${FOLDER}"`));

// ── renameEntry: project rewrites name only, keeps path ─────────────────────
let rp = renameEntry(slnNoNested, APP, 'Renamed', false);
check('project rename keeps path', rp.includes(`= "Renamed", "App\\App.csproj", "${APP}"`));

// ── renameProjectEntry: rewrites name AND path (file rename) ────────────────
let rpe = renameProjectEntry(slnNoNested, APP, 'NewApp', 'App/NewApp.csproj');
check('project file rename updates name+path', rpe.includes(`= "NewApp", "App\\NewApp.csproj", "${APP}"`));

// ── addProjectEntry: forward slashes converted, nested under folder ─────────
const NEW = '{33333333-3333-3333-3333-333333333333}';
let ap = addProjectEntry(s, 'Lib', 'src/Lib/Lib.csproj', NEW, SLN_TYPE_GUIDS.csharp, FOLDER);
check('new project entry uses backslash path', ap.includes(`"Lib", "src\\Lib\\Lib.csproj", "${NEW}"`));
check('new project nested under folder', ap.includes(`${NEW} = ${FOLDER}`));

// ── removeEntry: drops block + nesting lines ────────────────────────────────
let rm = removeEntry(s2, APP);
check('removed project block', !rm.includes(`"${APP}"`));
check('removed project nesting line', !rm.includes(`${APP} = ${FOLDER}`));
check('folder block survives removal', rm.includes(`"${FOLDER}"`));

// ── CRLF preservation ───────────────────────────────────────────────────────
const crlf = slnNoNested.replace(/\n/g, '\r\n');
let c = addSolutionFolder(crlf, 'X', FOLDER);
check('CRLF preserved on insert', c.includes('EndProject\r\nGlobal') && !c.includes('EndProject\nGlobal'));
let cn = setNestedParent(c, APP, FOLDER);
check('CRLF new nested section', cn.includes('GlobalSection(NestedProjects) = preSolution\r\n'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
