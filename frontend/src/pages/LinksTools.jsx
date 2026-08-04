import CollapsibleSection from "../components/CollapsibleSection";

const SECTIONS = [
  {
    title: "Park & District Maps",
    links: [
      {
        label: "LA Parks Portal — Park Finder Map",
        description:
          "Interactive countywide map of every public park, searchable and filterable by park classification and operating agency.",
        url: "https://www.laparksportal.org/?z=9&x=-119.09665&y=34.26214&parks=publicparks_parkclass&parkid=&agencyid=",
      },
      {
        label: "Precincts & District Maps",
        description:
          "LA County Registrar-Recorder/County Clerk tool to look up supervisorial districts, voting precincts, and other electoral boundaries by address.",
        url: "https://www.lavote.gov/apps/precinctsmaps#",
      },
      {
        label: "Park Need by Study Area (PDF)",
        description:
          "Countywide Parks Needs Assessment report ranking park need by Study Area — useful background for grant application narratives.",
        url: "https://file.lacounty.gov/SDSInter/dpr/1126419_ParkNeedByStudyArea.pdf",
      },
    ],
  },
  {
    title: "Grant Eligibility & Equity Data",
    links: [
      {
        label: "Parks for California — Community Park Access",
        description:
          "Address-based lookup showing park access and equity metrics for a community. Enter a park or address to see its park-need profile.",
        url: "https://www.parksforcalifornia.org/communities/?address=Earvin+Magic+Johnson+Park+",
      },
      {
        label: "SB 535 Disadvantaged Communities Map",
        description:
          "CalEPA interactive map of state-designated SB 535 Disadvantaged Communities, often required for state grant eligibility and scoring.",
        url: "https://experience.arcgis.com/experience/1c21c53da8de48f1b946f3402fbae55c/page/SB-535-Disadvantaged-Communities",
      },
      {
        label: "CalEnviroScreen 4.0",
        description:
          "Interactive mapping tool showing pollution burden and population vulnerability scores by census tract — commonly cited in grant applications.",
        url: "https://experience.arcgis.com/experience/11d2f52282a54ceebcac7428e6184203/page/CalEnviroScreen-4_0",
      },
    ],
  },
];

function LinkCard({ label, description, url }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 flex flex-col">
      <h3 className="text-sm font-semibold text-[#1F2937] mb-1">{label}</h3>
      <p className="text-sm text-gray-500 flex-1 mb-4">{description}</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start bg-accent hover:bg-accent-dark text-white text-sm font-medium px-4 py-2 rounded-md"
      >
        Open ↗
      </a>
    </div>
  );
}

export default function LinksTools() {
  return (
    <div className="max-w-4xl space-y-6">
      {SECTIONS.map((section) => (
        <CollapsibleSection key={section.title} title={section.title}>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.links.map((link) => (
              <LinkCard key={link.url} {...link} />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}
