import {test, expect, type Page} from "@playwright/test";

async function setup(page:Page,role="owner"){
  let posted:unknown;
  let settings={
    operatorCode:"demo",operatorName:"Sample Operator",searchUrl:"",
    configured:false,source:"server_configuration",updatedBy:null,updatedAt:null,
    cityMappings:[{cityId:101,name:"Bengaluru",publicCityId:null},
      {cityId:102,name:"Mangaluru",publicCityId:null}]
  };
  await page.addInitScript(()=>sessionStorage.setItem("journeyos.adminKey","test-key"));
  await page.route("**/api/admin/me",r=>r.fulfill({json:{name:"QA Operator",role,tenant:"demo",auth:"key",phone:null}}));
  await page.route("**/api/admin/settings/booking-site",async r=>{
    if(r.request().method()==="PUT"){
      posted=r.request().postDataJSON();
      const input=posted as {searchUrl:string;cityMappings:{cityId:number;publicCityId:number|null}[]};
      settings={...settings,searchUrl:input.searchUrl,configured:input.searchUrl!=="",source:"database",
        updatedBy:"QA Operator",updatedAt:"2026-11-24T12:00:00Z",
        cityMappings:settings.cityMappings.map(c=>({...c,publicCityId:input.cityMappings.find(x=>x.cityId===c.cityId)?.publicCityId??null}))};
    }
    return r.fulfill({json:settings});
  });
  return{getPosted:()=>posted};
}

test("Website Settings persist explicit HTTPS URL and two distinct website city IDs",async({page})=>{
  const x=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await expect(page.getByTestId("operator-settings")).toBeVisible();
  await page.getByRole("textbox",{name:"Public booking search URL"}).fill("https://booking.example.com/bus/search/");
  await page.getByRole("spinbutton",{name:"Public city ID for Bengaluru"}).fill("12345");
  await page.getByRole("spinbutton",{name:"Public city ID for Mangaluru"}).fill("12346");
  await page.getByRole("button",{name:"Save Website Settings"}).click();
  await expect(page.getByRole("status").filter({hasText:"saved and audited"})).toBeVisible();
  expect(x.getPosted()).toEqual({searchUrl:"https://booking.example.com/bus/search/",
    cityMappings:[{cityId:101,publicCityId:12345},{cityId:102,publicCityId:12346}]});
  await expect(page.getByText("2 of 2")).toBeVisible();
  await page.getByRole("button",{name:"Team Access"}).click();
  await page.getByRole("button",{name:"Open Users & Access"}).click();
  await expect(page.getByRole("heading",{name:"Users & access"})).toBeVisible();
});

test("Website Settings block duplicate public city IDs and insecure schemes before sending",async({page})=>{
  const x=await setup(page);
  await page.goto("/");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("textbox",{name:"Public booking search URL"}).fill("http://localhost/unsafe");
  await expect(page.getByRole("alert")).toContainText("public HTTPS URL");
  await expect(page.getByRole("button",{name:"Save Website Settings"})).toBeDisabled();
  await page.getByRole("textbox",{name:"Public booking search URL"}).fill("https://booking.example.com/search/");
  await page.getByRole("spinbutton",{name:"Public city ID for Bengaluru"}).fill("101");
  await page.getByRole("spinbutton",{name:"Public city ID for Mangaluru"}).fill("101");
  await expect(page.getByRole("alert")).toContainText("distinct positive integer");
  await expect(page.getByRole("button",{name:"Save Website Settings"})).toBeDisabled();
  expect(x.getPosted()).toBeUndefined();
});

test("Operations user cannot access operator Settings navigation",async({page})=>{
  await setup(page,"ops");
  await page.goto("/");
  await expect(page.getByRole("button",{name:"Settings",exact:true})).toHaveCount(0);
});
