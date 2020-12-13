import * as fs from 'fs'
import * as path from 'path'
import { parse } from "postcode"

type CensusRecord = {
    population: number,
    females: number,
    males: number,
    households: number,
    areaName: string,
    OACSupergroupCode: string,
    OACGroupCode: string,
    OACSubgroupCode: string,
    areaDeprivationScore: number,
    postcodeDeprivationScore: number
}

type CensusData = {
    [area: string]: {
        [outcode: string]: {
            [postcode: string]: CensusRecord
        }
    }
}

type OACCodes = {
    [supergroup: string]: {
        name: string,
        children: {
            [group: string]: {
                children: {
                    [subgroup: string]: string
                }
            }    
        }
    }
}

const convert = async () => {

    const datafiles = fs.readdirSync("./rawdata/").map(fileName => {
        return path.join("./rawdata/", fileName)
    })

    const censusData: CensusData = {}
    const oacCodes: OACCodes = {}

    for (const file of datafiles) {
        console.log(file)
        
        const csv = fs.readFileSync(file)
        const lines = csv.toString().split(/\n/)
        const headings = lines.shift().split(/\s*,\s*/).map(col => col.replace(/\r/, ''))


        for (const line of lines) {

            const cols = line.split(/\s*,\s*/).map(col => col.replace(/\r/, ''))

            // fix for comma in placename
            // like: Mosstodloch, Portgordon and seaward - 01
            while (cols.length > 31) {
                cols[13] = `${cols[13]}, ${cols[14]}`
                cols.splice(14, 1)
            }

            const row: {[index: string]: any} = {}
            for (const col in cols) {
                row[headings[col]] = cols[col]
            }

            let parsed = parse(row.PCD)
            if (!parsed.valid) {
                parsed = parse(row.PCD.slice(0, -1))
            }

            if (!parsed.valid) {
                continue
            }

            if (!(row.OAC_Supergroup_Code in oacCodes)) {
                oacCodes[row.OAC_Supergroup_Code] = {
                    name: row.OAC_Supergroup_Name,
                    children: {}
                }
            }

            if (!(row.OAC_Group_Code in oacCodes[row.OAC_Supergroup_Code].children)) {
                oacCodes[row.OAC_Supergroup_Code].children[row.OAC_Group_Code] = {
                    children: {}
                }
            }

            if (!(row.OAC_Subgroup_Code in oacCodes[row.OAC_Supergroup_Code].children[row.OAC_Group_Code].children)) {
                oacCodes[row.OAC_Supergroup_Code].children[row.OAC_Group_Code].children[row.OAC_Subgroup_Code] = row.OAC_Subgroup_Name
            }

            const { postcode, area, outcode } = parsed

            const record:CensusRecord = {
                population: parseInt(row.Total_Persons || '0'),
                females: parseInt(row.Females || '0'),
                males: parseInt(row.Males || '0'),
                households: parseInt(row.Occupied_Households || '0'),
                areaName: row.LSOA_DZ_Name,
                OACSupergroupCode: row.OAC_Supergroup_Code,
                OACGroupCode: row.OAC_Group_Code,
                OACSubgroupCode: row.OAC_Subgroup_Code,
                areaDeprivationScore: parseFloat(row.LSOA_DZ_Townsend_Deprivation_Score || '0'),
                postcodeDeprivationScore: parseFloat(row.OA_SA_Townsend_Deprivation_Score || '0')
            }

            if (!(area in censusData)) {
                censusData[area] = {}
                process.stdout.write(`\n${area} `)
            }

            if (!(outcode in censusData[area])) {
                censusData[area][outcode] = {}
            }

            censusData[area][outcode][postcode] = record
            // process.stdout.write(".")
        }
    }

    for (const area in censusData) {
        const output = JSON.stringify(censusData[area], null, 2)
        const filename = `./output/census-${area}.json`
        fs.writeFileSync(filename, output)     
    }

    const output = JSON.stringify(oacCodes, null, 2)
    const filename = `./output/oac.json`
    fs.writeFileSync(filename, output)     
}

convert()


